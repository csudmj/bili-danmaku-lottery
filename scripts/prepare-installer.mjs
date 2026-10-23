// Adapt electron-builder's pinned NSIS templates without replacing its install,
// uninstall, scope detection, or elevation implementation.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('electron-builder'));
const lib=path.dirname(require.resolve('app-builder-lib/package.json'));
if(JSON.parse(fs.readFileSync(path.join(lib,'package.json'),'utf8')).version!=='26.0.12')throw Error('Review combined installer page for the new electron-builder version');
const source=path.join(lib,'templates/nsis'),target=path.resolve('.build-cache/nsis');
fs.mkdirSync(target,{recursive:true});
const read=name=>fs.readFileSync(path.join(source,name),'utf8').replaceAll('\r\n','\n');
function replace(text,from,to){if(text.split(from).length!==2)throw Error('NSIS template changed: '+from.slice(0,70));return text.replace(from,to);}
let installer=read('installer.nsi');
installer=replace(installer,'!include "assistedInstaller.nsh"',`!include "${path.join(target,'assistedInstaller.nsh')}"`);
let assisted=read('assistedInstaller.nsh');
assisted=replace(assisted,'!include multiUserUi.nsh',`!include "${path.join(target,'multiUserUi.nsh')}"`);
assisted=replace(assisted,'    !insertmacro skipPageIfUpdated\n    !insertmacro MUI_PAGE_DIRECTORY','    # The directory controls are on PAGE_INSTALL_MODE.');
let ui=read('multiUserUi.nsh');
ui=replace(ui,'Var isForceCurrentInstall','Var isForceCurrentInstall\n!ifndef BUILD_UNINSTALLER\nVar Combined.Directory\nVar Combined.Browse\nVar Combined.Path\n!endif');
// An elevated child skips the selection page. Retrieve the validated path from
// its waiting parent, rather than resetting it to Program Files.
ui=replace(ui,'\t\t\t!insertmacro setInstallModePerAllUsers\n\t\t\tAbort',`\t\t\t!insertmacro setInstallModePerAllUsers
      !ifndef BUILD_UNINSTALLER
        !insertmacro UAC_AsUser_GetGlobal $Combined.Path $Combined.Path
        \${If} $Combined.Path != ""
          StrCpy $INSTDIR $Combined.Path
        \${EndIf}
      !endif
\t\t\tAbort`);
ui=replace(ui,'\t\t\${NSD_CreateLabel} 0u 110u 280u 50u ""',`    !ifndef BUILD_UNINSTALLER
      \${NSD_CreateLabel} 0u 76u 300u 12u "安装目标目录："
      Pop $0
      \${NSD_CreateDirRequest} 0u 91u 238u 14u "$INSTDIR"
      Pop $Combined.Directory
      \${NSD_CreateBrowseButton} 244u 90u 56u 16u "浏览…"
      Pop $Combined.Browse
      \${NSD_OnClick} $Combined.Browse Combined.Browse
    !endif
\t\t\${NSD_CreateLabel} 0u 113u 300u 27u ""`);
ui=replace(ui,'\tFunction "\${UNINSTALLER_FUNCPREFIX}\${LEAVE}"',`\tFunction "\${UNINSTALLER_FUNCPREFIX}\${LEAVE}"
    !ifndef BUILD_UNINSTALLER
      \${NSD_GetText} $Combined.Directory $Combined.Path
      \${GetRoot} "$Combined.Path" $0
      \${If} $0 == ""
      \${OrIf} $Combined.Path == $0
      \${OrIf} $Combined.Path == "$0\\"
        MessageBox MB_ICONEXCLAMATION|MB_OK "请选择包含文件夹名称的完整安装路径，不能直接安装到磁盘根目录。"
        Abort
      \${EndIf}
      GetFullPathName $Combined.Path "$Combined.Path"
    !endif`);
ui=replace(ui,'\t\t!insertmacro MUI_PAGE_FUNCTION_CUSTOM LEAVE',`    !ifndef BUILD_UNINSTALLER
      StrCpy $INSTDIR $Combined.Path
    !endif
\t\t!insertmacro MUI_PAGE_FUNCTION_CUSTOM LEAVE`);
// Each scope uses its registered directory (or its own default directory).
// No elevation occurs until the user submits this combined page.
ui=replace(ui,'\t\tSendMessage $RadioButtonLabel1 \${WM_SETTEXT} 0 "STR:$7"',`    !ifndef BUILD_UNINSTALLER
      \${If} $1 == "0"
        !insertmacro setInstallModePerUser
      \${Else}
        !insertmacro setInstallModePerAllUsers
      \${EndIf}
      \${NSD_SetText} $Combined.Directory "$INSTDIR"
    !endif
\t\tSendMessage $RadioButtonLabel1 \${WM_SETTEXT} 0 "STR:$7"`);
ui+=`
!ifndef BUILD_UNINSTALLER
Function Combined.Browse
  Pop $0
  \${NSD_GetText} $Combined.Directory $0
  nsDialogs::SelectFolderDialog "选择安装目标目录" "$0"
  Pop $0
  \${If} $0 != error
    \${NSD_SetText} $Combined.Directory "$0"
  \${EndIf}
FunctionEnd
!endif
`;
for(const [name,text] of [['installer.nsi',installer],['assistedInstaller.nsh',assisted],['multiUserUi.nsh',ui]])fs.writeFileSync(path.join(target,name),text);
// Override only the mode-page function macro at the supported welcome-page
// hook. Keep the stock top-level script so electron-builder still generates
// and embeds the uninstaller in its normal two-pass build.
fs.writeFileSync(path.join(target,'combined-functions.nsh'),ui.slice(ui.indexOf('!macro FUNCTION_INSTALL_MODE_PAGE_FUNCTION')));
fs.writeFileSync(path.join(target,'combined-page.nsh'),[
  '!ifndef BUILD_UNINSTALLER',
  'Var Combined.Directory', 'Var Combined.Browse', 'Var Combined.Path',
  '!macro customWelcomePage',
  '  !macroundef FUNCTION_INSTALL_MODE_PAGE_FUNCTION',
  `  !include "${path.join(target,'combined-functions.nsh')}"`,
  '  !undef allowToChangeInstallationDirectory',
  '!macroend', '!endif', '',
].join('\n'));
console.log('Prepared combined NSIS installation scope and directory page.');
