# ocr_windows.ps1
# ydsz-buddy Windows OCR
#
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File ocr_windows.ps1 -ImagePath <path> -Language <lang>
#  - ImagePath: 图像绝对路径(PNG / JPEG / BMP / TIFF)
#  - Language : BCP-47 语言标签(如 "zh-Hans"、"en-US"),默认 "en-US"
#
# 输出:每行一段识别出的文字到 stdout。
#       任意错误:打印到 stderr 并以非 0 退出码退出。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath,

    [string]$Language = "en-US"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ImagePath)) {
    [Console]::Error.WriteLine("[ocr_windows] image not found: $ImagePath")
    exit 3
}

try {
    # 加载 WinRT 桥接
    $null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
    $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
    $null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.RandomAccessStreamReference, Windows.Storage.Streams, ContentType = WindowsRuntime]
} catch {
    [Console]::Error.WriteLine("[ocr_windows] failed to load WinRT: $($_.Exception.Message)")
    exit 4
}

try {
    $lang = [Windows.Globalization.Language]::new($Language)
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
    if ($null -eq $engine) {
        # 部分 Windows 10 1809 之前版本不支持 zh-Hans 等扩展语言,
        # 退回到用户主语言
        [Console]::Error.WriteLine("[ocr_windows] OcrEngine for $Language unavailable, falling back to user language")
        $engine = [Windows.Media.Ocr.OcrEngine]::new()
    }
    if ($null -eq $engine) {
        [Console]::Error.WriteLine("[ocr_windows] no OCR engine available on this system")
        exit 5
    }

    $file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)
    $file.AsTask().Wait() | Out-Null

    $stream = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read)
    $stream.AsTask().Wait() | Out-Null

    $decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
    $decoder.AsTask().Wait() | Out-Null

    $bitmap = $decoder.GetSoftwareBitmapAsync()
    $bitmap.AsTask().Wait() | Out-Null

    $result = $engine.RecognizeAsync($bitmap)
    $result.AsTask().Wait() | Out-Null

    foreach ($line in $result.Lines) {
        [Console]::Out.WriteLine($line.Text)
    }
} catch {
    [Console]::Error.WriteLine("[ocr_windows] ocr failed: $($_.Exception.Message)")
    exit 6
}
