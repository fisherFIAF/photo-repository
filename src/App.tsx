import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import "./App.css";

interface ImageEntry {
  path: string;
  name: string;
}

function App() {
  const [images, setImages] = useState<ImageEntry[]>([]);

  async function handleOpenFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;

    const imageList = await invoke<ImageEntry[]>("list_images", { path: selected });
    setImages(imageList);
  }

  return (
    <div className="layout">
      <div className="bar-row">
        <div className="toolbar">
          <button className="toolbar-btn" onClick={handleOpenFolder} title="打开文件夹">
            📁
          </button>
        </div>
        <div className="status-bar">状态栏</div>
      </div>
      <div className="work-area">
        {images.length === 0 ? (
          <div className="empty-state">
            <span>工作区</span>
            <span>(显示图片列表)</span>
          </div>
        ) : (
          <div className="image-grid">
            {images.map((img) => (
              <div key={img.path} className="image-item">
                <img src={convertFileSrc(img.path)} alt={img.name} />
                <span className="image-name">{img.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
