import { Navbar } from './Navbar';
import { MediaPool } from './MediaPool';
import { PreviewWindow } from './PreviewWindow';
import { Inspector } from './Inspector';
import { TimelinePanel } from '../timeline/TimelinePanel';

export const EditorLayout = () => {
  return (
    <div className="editor-layout">
      <Navbar />
      <div className="workspace">
        <MediaPool />
        <PreviewWindow />
        <Inspector />
      </div>
      <TimelinePanel />
    </div>
  );
};
