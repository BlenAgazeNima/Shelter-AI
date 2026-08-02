import cv2
from ultralytics import YOLO
import math
from collections import defaultdict, deque

CAMERA_INDEX = 0
CONFIDENCE_THRESHOLD = 0.5
MOVEMENT_THRESHOLD = 20
MAX_TRAIL_LENGTH = 30

camera = cv2.VideoCapture(CAMERA_INDEX)
model = YOLO("yolo11n.pt")

track_history = defaultdict(lambda: deque(maxlen=MAX_TRAIL_LENGTH))

if not camera.isOpened():
    raise RuntimeError("Failed to open the webcam.")

while True:

    success, frame = camera.read()

    if not success:
        print("Failed to access the webcam.")
        break

    results = model.track(
        frame,
        persist=True,
        classes=[0],
        conf=CONFIDENCE_THRESHOLD,
        tracker="bytetrack.yaml",
        verbose=False
    )

    person_count = 0
    moving_count = 0

    result = results[0]

    if result.boxes is not None and result.boxes.id is not None:

        boxes = result.boxes.xyxy.cpu().numpy()
        person_ids = result.boxes.id.int().cpu().tolist()
        confidences = result.boxes.conf.cpu().tolist()

        person_count = len(person_ids)

        for box, person_id, confidence in zip(
            boxes,
            person_ids,
            confidences
        ):

            x1, y1, x2, y2 = map(int, box)

            center_x = int((x1 + x2) / 2)
            center_y = int((y1 + y2) / 2)

            current_position = (center_x, center_y)

            history = track_history[person_id]

            distance = 0.0
            status = "Still"
            colour = (0, 255, 0)


            if len(history) >= 5:
                previous_x, previous_y = history[-5]

                distance = math.sqrt(
                    (center_x - previous_x) ** 2
                    + (center_y - previous_y) ** 2
                )

                if distance > 20:
                    status = "Moving"
                    colour = (0, 165, 255)
                    moving_count += 1
            history.append(current_position)

            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                colour,
                2
            )

            cv2.circle(
                frame,
                current_position,
                4,
                (255, 0, 0),
                -1
            )

            label = (
                f"ID: {person_id} | "
                f"{status} | "
                f"{distance:.1f}px | "
                f"{confidence:.2f}"
            )

            cv2.putText(
                frame,
                label,
                (x1, max(y1 - 10, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                colour,
                2
            )


    cv2.putText(
        frame,
        f"People: {person_count}",
        (20, 50),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0),
        2
    )

    cv2.putText(
        frame,
        f"Moving: {moving_count}",
        (20, 85),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 165, 255),
        2
    )

    cv2.imshow(
        "Shelter AI - Occupancy and Movement Tracking",
        frame
    )

    if cv2.waitKey(1) & 0xFF in (ord("q"), ord("Q")):
        break

camera.release()
cv2.destroyAllWindows()