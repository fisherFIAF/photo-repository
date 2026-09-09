interface FacesStatusBarProps {
  facesBusy: boolean;
  facesStatus: string;
}

export function FacesStatusBar({ facesBusy, facesStatus }: FacesStatusBarProps) {
  return (
    <div className="faces-status-bar">
      <span>{facesBusy ? "处理中…" : facesStatus || "人物标签"}</span>
    </div>
  );
}
