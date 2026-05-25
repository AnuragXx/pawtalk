import urllib.request, shutil

try:
    urllib.request.urlopen("https://www.google.com", timeout=5)
    print("Internet: OK")
except Exception as e:
    print("Internet: FAILED", e)

for tool in ["ffmpeg", "ffprobe", "yt-dlp"]:
    path = shutil.which(tool)
    print(tool + ": " + (path if path else "NOT FOUND"))
