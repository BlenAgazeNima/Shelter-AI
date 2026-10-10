"""YOLO11 person detection through OpenCV, without importing PyTorch."""
from types import SimpleNamespace
import cv2
import numpy as np


class ArrayResult:
    def __init__(self, value):
        self.value = np.asarray(value)

    def cpu(self):
        return self

    def numpy(self):
        return self.value

    def int(self):
        return ArrayResult(self.value.astype(int))

    def tolist(self):
        return self.value.tolist()


class YOLO:
    """Person-only YOLO output adapter with independent centroid tracking per feed.

    This tracker is deliberately named separately from ByteTrack. Track IDs are
    temporary video trajectories, not identities or unique resident counts.
    """
    def __init__(self, path):
        self.net = cv2.dnn.readNetFromONNX(str(path))
        self.tracks = {}
        self.next_id = 1
        self.predictor = SimpleNamespace(trackers=[self])

    def reset(self):
        self.tracks.clear()

    def assign_tracks(self, boxes):
        candidates = dict(self.tracks)
        updated, ids = {}, []
        for x1, y1, x2, y2 in boxes:
            center = np.array([(x1+x2)/2, (y1+y2)/2])
            distances = [(float(np.linalg.norm(center-value[0])), key) for key,value in candidates.items()]
            distance, key = min(distances, default=(float('inf'), -1))
            if distance > max(60, (y2-y1)*0.6):
                key = self.next_id
                self.next_id += 1
            else:
                candidates.pop(key)
            updated[key] = (center, 0)
            ids.append(key)
        updated.update({key:(value[0],value[1]+1) for key,value in candidates.items() if value[1]<4})
        self.tracks = updated
        return ids

    def track(self, frame, conf=0.35, iou=0.5, **kwargs):
        h,w = frame.shape[:2]
        scale = min(640/w,640/h)
        nw,nh = round(w*scale),round(h*scale)
        left,top = (640-nw)//2,(640-nh)//2
        canvas = np.full((640,640,3),114,dtype=np.uint8)
        canvas[top:top+nh,left:left+nw] = cv2.resize(frame,(nw,nh))
        self.net.setInput(cv2.dnn.blobFromImage(canvas,1/255,(640,640),swapRB=True))
        prediction = self.net.forward()[0].T
        # COCO class 0 is person. Reject boxes assigned to another class.
        rows = prediction[(prediction[:,4]>=conf) & (prediction[:,4:].argmax(axis=1)==0)]
        boxes,scores = [],[]
        for row in rows:
            cx,cy,bw,bh = row[:4]
            x1 = max(0,float((cx-bw/2-left)/scale))
            y1 = max(0,float((cy-bh/2-top)/scale))
            x2 = min(w,float((cx+bw/2-left)/scale))
            y2 = min(h,float((cy+bh/2-top)/scale))
            if x2>x1 and y2>y1:
                boxes.append([x1,y1,x2-x1,y2-y1]); scores.append(float(row[4]))
        keep = cv2.dnn.NMSBoxes(boxes,scores,conf,iou)
        selected = np.asarray(keep).reshape(-1).tolist()
        xyxy = [[boxes[i][0],boxes[i][1],boxes[i][0]+boxes[i][2],boxes[i][1]+boxes[i][3]] for i in selected]
        ids = self.assign_tracks(xyxy)
        return [SimpleNamespace(boxes=SimpleNamespace(xyxy=ArrayResult(xyxy),conf=ArrayResult([scores[i] for i in selected]),id=ArrayResult(ids)))]
