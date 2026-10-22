param([switch]$NoDialog)
$ErrorActionPreference = 'Stop'
$checkRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$issues = [System.Collections.Generic.List[string]]::new()
$checked = 0
try {
    $manifestPath = Join-Path $checkRoot 'integrity.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        $issues.Add('缺少 integrity.json，无法核对发行文件哈希。请重新获取完整发行包。')
    } else {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($entry in $manifest.files) {
            $target = [System.IO.Path]::GetFullPath((Join-Path $checkRoot $entry.path))
            if (-not $target.StartsWith($checkRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw '校验清单包含无效路径' }
            if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { $issues.Add("缺少文件：$($entry.path)"); continue }
            try {
                $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
                if ($hash -ne $entry.sha256) { $issues.Add("文件不完整或已改变：$($entry.path)") }
                $checked++
            } catch { $issues.Add("无法读取文件：$($entry.path)，请检查权限或文件占用。") }
        }
    }
    foreach ($required in @('抽奖姬.exe','icudtl.dat','resources/app.asar','resources.pak','v8_context_snapshot.bin')) {
        if (-not (Test-Path -LiteralPath (Join-Path $checkRoot $required) -PathType Leaf)) { $issues.Add("启动必需文件缺失：$required") }
    }
} catch { $issues.Add('启动检查无法完成，请重新下载完整发布包。') }
$advice = @'

建议：
1. 不要在压缩包内启动，不要只复制 EXE。完整解压到新的可写文件夹，或重新运行 Setup 安装包。
2. 检查系统是否隔离了 icudtl.dat、DLL 或其他程序文件；不要关闭安全防护。
3. 若日志含 Invalid file descriptor to ICU data received，重点检查 icudtl.dat 是否存在、完整、可读。
4. 文件正常仍打不开时，检查 Windows 10/11 64 位环境，重启后重试，并在 GitHub Issue 附上此报告及问题现象。
5. 此检查只核对发行文件，不验证网络、显卡驱动或所有系统兼容性。哈希清单用于损坏检测，不代替数字签名。
项目：https://github.com/csudmj/bili-danmaku-lottery/issues
'@
$summary = if ($issues.Count -eq 0) { "文件完整性检查通过，已核对 $checked 个文件。" } else { "发现 $($issues.Count) 项异常：`r`n" + ($issues -join "`r`n") }
$report = "抽奖姬启动检查`r`n时间：$(Get-Date -Format s)`r`n$summary`r`n$advice"
$reportPath = Join-Path ([System.IO.Path]::GetTempPath()) ('抽奖姬-启动检查-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
try { Set-Content -LiteralPath $reportPath -Value $report -Encoding UTF8 } catch { $reportPath = '报告保存失败，请复制当前检查结果。' }
Write-Output $report
Write-Output "报告位置：$reportPath"
if (-not $NoDialog) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(($summary + "`r`n`r`n" + $advice + "`r`n`r`n报告位置：" + $reportPath), '抽奖姬启动检查') | Out-Null
}
if ($issues.Count -gt 0) { exit 1 }
