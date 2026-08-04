# Real footage included through automatic download

The setup script downloads four recordings from Wikimedia Commons and converts them to MP4 locally. The source pages contain the current licence and attribution details.

| Dashboard feed | Source recording |
|---|---|
| Occupancy / dining feed | People waiting to cross the street |
| Fall feed | Falling man |
| Recreation activity feed | Unserious fight on a birthday party |
| Corridor / tracking feed | Big City Life |

The recordings contain real people and are prerecorded. OpenCV and YOLO process the resulting MP4 files frame by frame at runtime. They are used only to demonstrate the prototype pipeline and must not be presented as real GDRFA shelter footage.

Source pages are recorded by `tools/download_real_footage.py` in `backend/videos/.real_footage_installed` after download.
