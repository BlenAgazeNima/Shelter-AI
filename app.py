import cv2
from ultralytics import YOLO

camera=cv2.VideoCapture(0)
model = YOLO("yolo11n.pt")

while True:
    success,frame=camera.read()

    if not success:
        print('Failed to access the webcam.')
        break

    results = model(frame)

    person_count = 0

    for result in results:
        for box in result.boxes:
            class_id=int(box.cls[0]) #returns the class id of the detected object
            confidence = float(box.conf[0])
            if model.names[class_id] =="person" and confidence>=0.5:
                person_count+=1
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                (0,255,0),
                1)

    cv2.putText(
        frame,
        f"People: {person_count}",
        (20,50),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0,255,0),
        2
                    )

    cv2.imshow("Shelter AI - Live Camera", frame)

    if cv2.waitKey(1) & 0xFF in (ord('q'), ord('Q')):
        break

camera.release()
cv2.destroyAllWindows()