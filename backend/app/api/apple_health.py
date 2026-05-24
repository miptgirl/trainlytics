import os
import tempfile

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile

from app.dependencies import get_current_user
from app.services import apple_health_service

router = APIRouter(prefix="/apple-health", tags=["apple-health"])


@router.post("/upload")
async def upload_apple_health(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    username: str = Depends(get_current_user),
) -> dict:
    filename = file.filename or ""
    if not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive")

    task_id = apple_health_service.new_task_id()
    temp_dir = tempfile.mkdtemp(prefix="ah_")
    zip_path = os.path.join(temp_dir, "upload.zip")

    # Stream upload to disk to handle large files without loading into memory
    with open(zip_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)  # 1 MB chunks
            if not chunk:
                break
            f.write(chunk)

    background_tasks.add_task(
        apple_health_service.parse_xml_worker,
        task_id,
        zip_path,
        temp_dir,
        username,
    )
    return {"task_id": task_id}


@router.get("/status/{task_id}")
async def get_parse_status(
    task_id: str,
    username: str = Depends(get_current_user),
) -> dict:
    status = apple_health_service.get_task_status(task_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return status
