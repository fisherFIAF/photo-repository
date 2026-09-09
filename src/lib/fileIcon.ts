export function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const videoExts = [
    "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v",
    "mpeg", "mpg", "3gp",
  ];
  return videoExts.includes(ext) ? "🎬" : "🖼️";
}
