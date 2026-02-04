import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ZoomIn, ZoomOut, Download, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  fileType: string;
}

export function FilePreviewModal({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  fileType,
}: FilePreviewModalProps) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const isImage = fileType.startsWith('image/');
  const isPdf = fileType === 'application/pdf';

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 300));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClose = () => {
    setZoom(100);
    setRotation(0);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0 gap-0 bg-black/95 border-0">
        {/* Header */}
        <div className="flex items-center justify-between p-3 md:p-4 bg-black/50 backdrop-blur-sm border-b border-white/10">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{fileName}</p>
          </div>
          <div className="flex items-center gap-1 md:gap-2 ml-2 md:ml-4">
            {isImage && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                  className="text-white hover:bg-white/10 transition-colors h-9 w-9 md:h-10 md:w-10"
                  title="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-white/70 min-w-[40px] md:min-w-[50px] text-center">
                  {zoom}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={zoom >= 300}
                  className="text-white hover:bg-white/10 transition-colors h-9 w-9 md:h-10 md:w-10"
                  title="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <div className="w-px h-6 bg-white/10 mx-1 hidden md:block" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRotate}
                  className="text-white hover:bg-white/10 transition-colors h-9 w-9 md:h-10 md:w-10 hidden md:flex"
                  title="Rotate"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
                <div className="w-px h-6 bg-white/10 mx-1 hidden md:block" />
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="text-white hover:bg-white/10 transition-colors h-9 w-9 md:h-10 md:w-10 hidden md:flex"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="text-white hover:bg-white/10 transition-colors h-10 w-10 md:h-10 md:w-10"
              title="Close"
            >
              <X className="h-5 w-5 md:h-4 md:w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 md:p-8">
          {isImage ? (
            <div
              className="transition-all duration-300 ease-out"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              }}
            >
              <img
                src={fileUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain animate-fade-in"
                style={{
                  imageRendering: zoom > 100 ? 'auto' : 'crisp-edges',
                }}
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={fileUrl}
              className="w-full h-full border-0 rounded-lg animate-fade-in"
              title={fileName}
            />
          ) : (
            <div className="text-center space-y-4 animate-fade-in">
              <div className="w-20 h-20 mx-auto rounded-full bg-white/10 flex items-center justify-center">
                <Download className="h-10 w-10 text-white/70" />
              </div>
              <p className="text-white/70">Preview not available</p>
              <Button
                onClick={handleDownload}
                className="bg-white text-black hover:bg-white/90"
              >
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          )}
        </div>

        {/* Mobile-friendly footer with close button */}
        <div className="bg-black/50 backdrop-blur-sm border-t border-white/10">
          <div className="md:hidden p-3">
            <Button
              onClick={handleClose}
              className="w-full bg-white text-black hover:bg-white/90 h-12 text-base font-medium"
            >
              <X className="h-5 w-5 mr-2" />
              Close
            </Button>
          </div>
          <div className="p-2 text-center text-xs text-white/50">
            {isImage ? (
              <span className="hidden md:inline">Use zoom controls or scroll to zoom • Click outside to close</span>
            ) : (
              <span className="hidden md:inline">Click outside to close</span>
            )}
            <span className="md:hidden">Tap outside or use the Close button</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
