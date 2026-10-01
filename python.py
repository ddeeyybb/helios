from ultralytics import YOLO

# 1. Load your trained "brain"
model = YOLO('runs/segment/train/weights/best.pt')

# 2. Tell it to look at the picture and save the result
model.predict(source='test_house.jpg', save=True)