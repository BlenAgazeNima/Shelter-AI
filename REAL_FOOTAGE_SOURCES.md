# Indoor recordings and detection

The four feeds use licensed prerecorded stock footage of communal indoor spaces.
They are not recordings of Al Awir residents or facilities. The interface labels
these as recorded video. Original files remain in backend/videos/originals.

| Feed | Pexels source |
|---|---|
| Dining hall | https://www.pexels.com/video/18533896/ (Nazim Zafri) |
| Care area | https://www.pexels.com/video/5203513/ |
| Recreation room | https://www.pexels.com/video/31789801/ |
| Staff corridor | https://www.pexels.com/video/6130553/ |

License: https://www.pexels.com/license/ permits application use and modification.
Clips are shortened, resized and muted. Reinstall with the local AI Python and
tools/install_indoor_footage.py. This replaces the previous outdoor/stunt clips.

This computer blocks PyTorch shm.dll. The local .env selects SHELTER_AI_ENGINE=opencv
and SHELTER_ENABLE_AI=1. OpenCV DNN runs YOLO11n ONNX person detection without
changing Windows protections. Temporary centroid trajectory IDs are used instead
of ByteTrack in this engine; they do not identify residents. Possible safety
alerts require officer review; these clips do not validate fall detection.

ONNX weights: https://huggingface.co/webnn/yolo11n (AGPL-3.0), derived from
Ultralytics YOLO11. Stored at backend/yolo11n.onnx. Preserve licence obligations
when distributing the application. Existing PyTorch weights remain available.
