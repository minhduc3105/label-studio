import logging
import time
import traceback
import json
import xml.etree.ElementTree as ET
from typing import Callable, Optional

from core.feature_flags import flag_set
from core.utils.common import load_func
from data_import.uploader import load_tasks_for_async_import_streaming
from django.conf import settings
from django.db import transaction
from label_studio_sdk.label_interface import LabelInterface
from projects.models import ProjectImport, ProjectReimport, ProjectSummary
from rest_framework.exceptions import ValidationError
from tasks.models import Task
from users.models import User
from webhooks.models import WebhookAction
from webhooks.utils import emit_webhooks_for_instance

from .models import FileUpload
from .serializers import ImportApiSerializer
from .uploader import load_tasks_for_async_import

logger = logging.getLogger(__name__)


def async_import_background(import_id, user_id, recalculate_stats_func=None, **kwargs):
    print("=== 🟢 START async_import_background() ===")
    logger.info("=== 🟢 STARTING async_import_background() ===")
    print("=== 🟢 STARTING async_import_background() ===")
    logger.info(f"Import ID: {import_id}, User ID: {user_id}, Kwargs: {kwargs}")
    print(f"Import ID: {import_id}, User ID: {user_id}, Kwargs: {kwargs}")

    start = time.time()

    # --- 1️⃣ Lấy ProjectImport ---
    with transaction.atomic():
        try:
            project_import = ProjectImport.objects.get(id=import_id)
            logger.info(f"✅ Found ProjectImport: {project_import}")
            print(f"✅ Found ProjectImport: {project_import}")
        except ProjectImport.DoesNotExist:
            logger.error(f"❌ ProjectImport with id {import_id} not found")
            print(f"❌ ProjectImport with id {import_id} not found")
            return

        if project_import.status != ProjectImport.Status.CREATED:
            logger.warning(f"⚠️ Import {import_id} already started (status={project_import.status})")
            print(f"⚠️ Import {import_id} already started (status={project_import.status})")
            return

        project_import.status = ProjectImport.Status.IN_PROGRESS
        project_import.save(update_fields=['status'])

    user = User.objects.get(id=user_id)
    project = project_import.project

    logger.info(f"👤 Importer user: {user.username} ({user.email})")
    print(f"👤 Importer user: {user.username} ({user.email})")
    logger.info(f"📁 Target project: {project.title if hasattr(project, 'title') else project}")
    print(f"📁 Target project: {project.title if hasattr(project, 'title') else project}")

    # --- 2️⃣ Load dữ liệu từ file upload ---
    logger.info("📥 Loading tasks from uploaded files...")
    print("📥 Loading tasks from uploaded files...")
    tasks, file_upload_ids, found_formats, data_columns = load_tasks_for_async_import(project_import, user)

    logger.info(f"📊 Found data columns: {data_columns}")
    print(f"📊 Found data columns: {data_columns}")
    logger.info(f"🗂️ File upload IDs: {file_upload_ids}")
    print(f"🗂️ File upload IDs: {file_upload_ids}")
    logger.info(f"📄 Found formats: {found_formats}")
    print(f"📄 Found formats: {found_formats}")
    logger.info(f"📦 Loaded {len(tasks)} tasks")
    print(f"📦 Loaded {len(tasks)} tasks")

    # Hiển thị thử 2 task đầu
    if tasks:
        try:
            logger.info("🔍 Example task #1:")
            logger.info(json.dumps(tasks[0], indent=2, ensure_ascii=False))
            print("🔍 Example task #1:")
            print(json.dumps(tasks[0], indent=2, ensure_ascii=False))
            if len(tasks) > 1:
                logger.info("🔍 Example task #2:")
                logger.info(json.dumps(tasks[1], indent=2, ensure_ascii=False))
                print("🔍 Example task #2:")
                print(json.dumps(tasks[1], indent=2, ensure_ascii=False))
        except Exception as e:
            logger.warning(f"Không thể in task mẫu: {e}")
            print(f"Không thể in task mẫu: {e}")

    # --- 3️⃣ Chuyển cột 'label' thành annotations nếu có ---
    if data_columns and 'label' in data_columns:
        logger.info("🧩 Found 'label' column, converting to annotations...")
        print("🧩 Found 'label' column, converting to annotations...")
        tasks = convert_label_column_to_label(tasks, project, user)
    else:
        logger.info("ℹ️ No 'label' column found in imported data.")
        print("ℹ️ No 'label' column found in imported data.")

    # --- 4️⃣ Tiền xử lý các cột preannotated_from_fields (nếu có) ---
    if project_import.preannotated_from_fields:
        raise_errors = flag_set(
            'fflag_feat_utc_210_prediction_validation_15082025', 
            user=project.organization.created_by
        )
        logger.info(f"⚙️ Reformatting predictions with raise_errors={raise_errors}")
        print(f"⚙️ Reformatting predictions with raise_errors={raise_errors}")
        tasks = reformat_predictions(tasks, project_import.preannotated_from_fields, project, raise_errors)

    # --- 5️⃣ Validate predictions ---
    if project.label_config_is_not_default and flag_set(
        'fflag_feat_utc_210_prediction_validation_15082025', 
        user=project.organization.created_by
    ):
        validation_errors = []
        li = LabelInterface(project.label_config)
        for i, task in enumerate(tasks):
            if 'predictions' in task:
                for j, prediction in enumerate(task['predictions']):
                    try:
                        validation_errors_list = li.validate_prediction(prediction, return_errors=True)
                        if validation_errors_list:
                            for error in validation_errors_list:
                                validation_errors.append(f'Task {i}, prediction {j}: {error}')
                    except Exception as e:
                        msg = f'Task {i}, prediction {j}: Exception - {e}'
                        logger.error(msg)
                        print(msg)
                        validation_errors.append(msg)

        if validation_errors:
            logger.error(f"❌ Prediction validation failed ({len(validation_errors)} errors)")
            print(f"❌ Prediction validation failed ({len(validation_errors)} errors)")
            for e in validation_errors[:10]:
                logger.error(e)
                print(f"- {e}")
            project_import.error = "\n".join(validation_errors)
            project_import.status = ProjectImport.Status.FAILED
            project_import.save(update_fields=['error', 'status'])
            return

    # --- 6️⃣ Commit vào Project nếu được cấu hình ---
    if project_import.commit_to_project:
        logger.info("💾 Committing imported tasks to the project database...")
        print("💾 Committing imported tasks to the project database...")
        with transaction.atomic():
            summary = ProjectSummary.objects.select_for_update().get(project=project)
            serializer = ImportApiSerializer(data=tasks, many=True, context={'project': project})
            serializer.is_valid(raise_exception=True)

            try:
                tasks = serializer.save(project_id=project.id)
                emit_webhooks_for_instance(user.active_organization, project, WebhookAction.TASKS_CREATED, tasks)
                task_count = len(tasks)
                annotation_count = len(serializer.db_annotations)
                prediction_count = len(serializer.db_predictions)

                logger.info(f"✅ Created {task_count} tasks, {annotation_count} annotations, {prediction_count} predictions.")
                print(f"✅ Created {task_count} tasks, {annotation_count} annotations, {prediction_count} predictions.")

                recalculate_stats_counts = {
                    'task_count': task_count,
                    'annotation_count': annotation_count,
                    'prediction_count': prediction_count,
                }

                project.update_tasks_counters_and_task_states(
                    tasks_queryset=tasks,
                    tasks_number_changed=True,
                    recalculate_stats_counts=recalculate_stats_counts,
                    maximum_annotations_changed=False,
                    overlap_cohort_percentage_changed=False,
                )
                summary.update_data_columns(tasks)

            except Exception as e:
                logger.error(f"❌ Error creating tasks: {e}", exc_info=True)
                print(f"❌ Error creating tasks: {e}")
                project_import.error = str(e)
                project_import.status = ProjectImport.Status.FAILED
                project_import.save(update_fields=['error', 'status'])
                return
    else:
        logger.info("📝 Import not committed to project (commit_to_project=False).")
        print("📝 Import not committed to project (commit_to_project=False).")
        task_count = len(tasks)
        annotation_count = None
        prediction_count = None

    # --- 7️⃣ Hoàn tất ---
    duration = time.time() - start
    project_import.task_count = task_count or 0
    project_import.annotation_count = annotation_count or 0
    project_import.prediction_count = prediction_count or 0
    project_import.duration = duration
    project_import.file_upload_ids = file_upload_ids
    project_import.found_formats = found_formats
    project_import.data_columns = data_columns
    if project_import.return_task_ids:
        project_import.task_ids = [t.id for t in tasks if hasattr(t, "id")]

    project_import.status = ProjectImport.Status.COMPLETED
    project_import.save()

    logger.info(f"✅ Import completed in {duration:.2f}s with {task_count} tasks.")
    print(f"✅ Import completed in {duration:.2f}s with {task_count} tasks.")
    logger.info("=== 🟢 END async_import_background() ===")
    print("=== 🟢 END async_import_background() ===")


def convert_label_column_to_label(tasks, project, user):
    """
    Hàm tùy chỉnh label theo THỨ TỰ của label được đưa vào.
    Hàm này giả định cột 'label' là 0-indexed (0 = lựa chọn thứ nhất, 1 = lựa chọn thứ hai, ...).
    """
    logger.info(f"Running DYNAMIC (Order-Based) 'label' to 'sentiment' mapping for {len(tasks)} tasks.")
    
    choice_tag_name = 'sentiment'  # Tên thẻ <Choices name="...">
    source_data_column = 'label'   # Tên cột trong file JSON/CSV
    choice_list = []

    # --- 1. Phân tích Label Config để xây dựng bảng ánh xạ ---
    try: 
        root = ET.fromstring(project.label_config)
        
        # SỬA LỖI 1: Tìm đúng thẻ 'Choices', không phải 'Control'
        control_tag = root.find(f".//Choices[@name='{choice_tag_name}']")
        
        # SỬA LỖI 2: Logic đảo ngược. Nếu KHÔNG TÌM THẤY (is None) thì mới dừng.
        if control_tag is None:
            logger.warning(
                f"Không tìm thấy thẻ <Choices name='{choice_tag_name}'> trong Label Config. "
                f"Bỏ qua việc tạo annotation tùy chỉnh."
            )
            return tasks # Trả về task gốc

        # SỬA LỖI 3: Di chuyển vòng lặp .findall vào bên trong khối 'if'
        for choice in control_tag.findall('Choice'):
            value = choice.get('value')
            if value:
                choice_list.append(value)
        
        if not choice_list:
            logger.warning(
                f"Đã tìm thấy thẻ <Choices name='{choice_tag_name}'>, nhưng không có thẻ <Choice> nào bên trong. "
                f"Bỏ qua."
            )
            return tasks
        
        # SỬA LỖI: Sửa 'infor' thành 'info'
        logger.info(f"Bảng ánh xạ dựa trên THỨ TỰ được xây dựng: {choice_list}")

    except ET.ParseError as e:
        logger.error(f"Lỗi khi phân tích XML của Label Config: {e}. Bỏ qua.", exc_info=True)
        return tasks
    except Exception as e:
        logger.error(f"Lỗi không xác định khi phân tích Label Config: {e}. Bỏ qua.", exc_info=True)
        return tasks
    
    # --- 2. Lặp qua các Task để gán trường 'sentiment' tạm thời ---
    tasks_to_reformat = []
    for task in tasks:
        label_value = None
        if 'data' in task and source_data_column in task['data']:
            label_value = task['data'][source_data_column]
        elif source_data_column in task:
            label_value = task[source_data_column]

        # SỬA LỖI 5: Logic đảo ngược. Nếu không hợp lệ (None, '', 'null') thì MỚI continue (bỏ qua).
        if label_value is None or str(label_value).strip() == '' or str(label_value).strip().lower() == 'null':
            tasks_to_reformat.append(task)
            continue
        
        # Handle both list of labels and single label
        label_values = label_value if isinstance(label_value, list) else [label_value]
        matched_labels = []
        
        for single_label in label_values:
            # Try to match as numeric index first
            try:
                label_int = int(single_label)
                if 0 <= label_int < len(choice_list):
                    matched_labels.append(choice_list[label_int])
                else:
                    logger.warning(f"Label index {label_int} out of range for task. Skipping this label.")
            except (ValueError, TypeError):
                # Not a number, try to match as string
                label_str = str(single_label).strip()
                if label_str in choice_list:
                    matched_labels.append(label_str)
                else:
                    logger.warning(f"Label string '{label_str}' not found in choice list {choice_list}. Skipping this label.")
        
        # Assign matched labels to task
        if matched_labels:
            if 'data' not in task:
                task = {'data': task}
            
            # If original was a list, keep as list; otherwise use single value
            if isinstance(label_value, list):
                task['data'][choice_tag_name] = matched_labels
            else:
                task['data'][choice_tag_name] = matched_labels[0] if matched_labels else None
        
        tasks_to_reformat.append(task)

    # --- 3. SỬA LỖI 4: THÊM PHẦN BỊ THIẾU ---
    
    # 3a. Gọi reformat_predictions để tạo 'predictions'
    try:
        # Giả định 'reformat_predictions' được định nghĩa trong cùng file này
        tasks_with_preds = reformat_predictions(
            tasks_to_reformat, 
            preannotated_from_fields=[choice_tag_name], 
            project=project, 
            raise_errors=False
        )
    except Exception as e:
        logger.error(f"Lỗi trong reformat_predictions cho cột '{choice_tag_name}': {e}", exc_info=True)
        return tasks_to_reformat

    # 3b. Chuyển 'predictions' thành 'annotations'
    final_tasks = []
    for i, task in enumerate(tasks_with_preds):
        if task.get('predictions'):
            task['annotations'] = task.pop('predictions')
            
            for ann in task['annotations']:
                ann.pop('score', None)
                ann.pop('model_version', None)
                ann['completed_by'] = user.id

        final_tasks.append(task)
            
    return final_tasks
        



def set_import_background_failure(job, connection, type, value, _):
    import_id = job.args[0]
    ProjectImport.objects.filter(id=import_id).update(
        status=ProjectImport.Status.FAILED, traceback=traceback.format_exc(), error=str(value)
    )


def set_reimport_background_failure(job, connection, type, value, _):
    reimport_id = job.args[0]
    ProjectReimport.objects.filter(id=reimport_id).update(
        status=ProjectReimport.Status.FAILED,
        traceback=traceback.format_exc(),
        error=str(value),
    )


def reformat_predictions(tasks, preannotated_from_fields, project=None, raise_errors=False):
    """
    Transform flat task JSON objects into proper format with separate data and predictions fields.
    Also validates the predictions to ensure they are properly formatted using LabelInterface.

    Args:
        tasks: List of task data
        preannotated_from_fields: List of field names to convert to predictions
        project: Optional project instance to determine correct to_name and type from label config
    """
    new_tasks = []
    validation_errors = []

    # If project is provided, create LabelInterface to determine correct mappings
    li = None
    if project:
        try:
            li = LabelInterface(project.label_config)
        except Exception as e:
            logger.warning(f'Could not create LabelInterface for project {project.id}: {e}')

    for task_index, task in enumerate(tasks):
        if 'data' in task:
            task_data = task['data']
        else:
            task_data = task

        predictions = []
        for field in preannotated_from_fields:
            if field not in task_data:
                validation_errors.append(f"Task {task_index}: Preannotated field '{field}' not found in task data")
                continue

            value = task_data[field]
            if value is not None:
                # Try to determine correct to_name and type from project configuration
                to_name = 'text'  # Default fallback
                prediction_type = 'choices'  # Default fallback

                if li:
                    # Find a control tag that matches the field name
                    try:
                        control_tag = li.get_control(field)
                        # Use the control's to_name and determine type
                        if hasattr(control_tag, 'to_name') and control_tag.to_name:
                            to_name = (
                                control_tag.to_name[0]
                                if isinstance(control_tag.to_name, list)
                                else control_tag.to_name
                            )
                            prediction_type = control_tag.tag.lower()
                    except Exception:
                        # Control not found, use defaults
                        pass

                # Create prediction from preannotated field
                # Handle different types of values
                if isinstance(value, dict):
                    # For complex structures like bounding boxes, use the value directly
                    prediction_value = value
                else:
                    # For simple values, use the prediction_type as the key
                    # Handle cases where the type doesn't match the expected key
                    value_key = prediction_type
                    if prediction_type == 'textarea':
                        value_key = 'text'

                    # Most types expect lists, but some expect single values
                    if prediction_type in ['rating', 'number', 'datetime']:
                        prediction_value = {value_key: value}
                    else:
                        # Wrap in list for most types
                        prediction_value = {value_key: [value] if not isinstance(value, list) else value}

                prediction = {
                    'result': [
                        {
                            'from_name': field,
                            'to_name': to_name,
                            'type': prediction_type,
                            'value': prediction_value,
                        }
                    ],
                    'score': 1.0,
                    'model_version': 'preannotated',
                }

                predictions.append(prediction)

        # Create new task structure
        new_task = {'data': task_data, 'predictions': predictions}
        new_tasks.append(new_task)

    # If there are validation errors, raise them
    if validation_errors and raise_errors:
        raise ValidationError({'preannotated_fields': validation_errors})

    return new_tasks


post_process_reimport = load_func(settings.POST_PROCESS_REIMPORT)


def _async_reimport_background_streaming(reimport, project, organization_id, user):
    print("=== 🟢 START _async_reimport_background_streaming() ===")
    """Streaming version of reimport that processes tasks in batches to reduce memory usage"""
    try:
        # Get batch size from settings or use default
        batch_size = settings.REIMPORT_BATCH_SIZE

        # Initialize counters
        total_task_count = 0
        total_annotation_count = 0
        total_prediction_count = 0
        all_found_formats = {}
        all_data_columns = set()
        all_created_task_ids = []

        # Remove old tasks once before starting
        with transaction.atomic():
            project.remove_tasks_by_file_uploads(reimport.file_upload_ids)

        # Process tasks in batches
        batch_number = 0
        for batch_tasks, batch_formats, batch_columns in FileUpload.load_tasks_from_uploaded_files_streaming(
            project, reimport.file_upload_ids, files_as_tasks_list=reimport.files_as_tasks_list, batch_size=batch_size
        ):
            if not batch_tasks:
                logger.info(f'Empty batch received for reimport {reimport.id}')
                continue

            batch_number += 1
            logger.info(f'Processing batch {batch_number} with {len(batch_tasks)} tasks for reimport {reimport.id}')
            
            if batch_columns and 'label' in batch_columns:
                logger.info("Found 'label' column in imported data, attempting to convert to anotations...")
                batch_tasks = convert_label_column_to_label(batch_tasks, project, user)

            # Process batch in transaction
            with transaction.atomic():
                # Lock summary for update to avoid race conditions
                summary = ProjectSummary.objects.select_for_update().get(project=project)

                # Serialize and save batch
                serializer = ImportApiSerializer(
                    data=batch_tasks, many=True, context={'project': project, 'user': user}
                )
                serializer.is_valid(raise_exception=True)
                batch_db_tasks = serializer.save(project_id=project.id)

                # Collect task IDs for later use
                all_created_task_ids.extend([t.id for t in batch_db_tasks])

                # Update batch counters
                batch_task_count = len(batch_db_tasks)
                batch_annotation_count = len(serializer.db_annotations)
                batch_prediction_count = len(serializer.db_predictions)

                total_task_count += batch_task_count
                total_annotation_count += batch_annotation_count
                total_prediction_count += batch_prediction_count

                # Update formats and columns
                all_found_formats.update(batch_formats)
                if batch_columns:
                    if not all_data_columns:
                        all_data_columns = batch_columns
                    else:
                        all_data_columns &= batch_columns

                # Update data columns in summary
                summary.update_data_columns(batch_db_tasks)

            logger.info(
                f'Batch {batch_number} processed successfully: {batch_task_count} tasks, '
                f'{batch_annotation_count} annotations, {batch_prediction_count} predictions'
            )

        # After all batches are processed, emit webhooks and update task states once
        if all_created_task_ids:
            logger.info(
                f'Finalizing reimport: emitting webhooks and updating task states for {len(all_created_task_ids)} tasks'
            )

            # Emit webhooks for all tasks at once (passing list of IDs)
            emit_webhooks_for_instance(organization_id, project, WebhookAction.TASKS_CREATED, all_created_task_ids)

            # Update task states for all tasks at once
            all_tasks_queryset = Task.objects.filter(id__in=all_created_task_ids)
            recalculate_stats_counts = {
                'task_count': total_task_count,
                'annotation_count': total_annotation_count,
                'prediction_count': total_prediction_count,
            }

            project.update_tasks_counters_and_task_states(
                tasks_queryset=all_tasks_queryset,
                maximum_annotations_changed=False,
                overlap_cohort_percentage_changed=False,
                tasks_number_changed=True,
                recalculate_stats_counts=recalculate_stats_counts,
            )
            logger.info('Tasks bulk_update finished (async streaming reimport)')

        # Update reimport with final statistics
        reimport.task_count = total_task_count
        reimport.annotation_count = total_annotation_count
        reimport.prediction_count = total_prediction_count
        reimport.found_formats = all_found_formats
        reimport.data_columns = list(all_data_columns)
        reimport.status = ProjectReimport.Status.COMPLETED
        reimport.save()

        logger.info(f'Streaming reimport {reimport.id} completed: {total_task_count} tasks imported')

        # Run post-processing
        post_process_reimport(reimport)

    except Exception as e:
        logger.error(f'Error in streaming reimport {reimport.id}: {str(e)}', exc_info=True)
        reimport.status = ProjectReimport.Status.FAILED
        reimport.traceback = traceback.format_exc()
        reimport.error = str(e)
        reimport.save()
        raise


def _async_import_background_streaming(project_import, user):
    print("=== 🟢 START _async_import_background_streaming() ===")
    try:
        batch_size = settings.IMPORT_BATCH_SIZE

        total_task_count = 0
        total_annotation_count = 0
        total_prediction_count = 0
        all_created_task_ids = []

        project = project_import.project
        start = time.time()

        batch_number = 0
        streaming_generator = load_tasks_for_async_import_streaming(project_import, user, batch_size)

        final_file_upload_ids = []
        final_found_formats = {}
        final_data_columns = set()

        for batch_tasks, file_upload_ids, found_formats, data_columns in streaming_generator:
            if not batch_tasks:
                logger.info(f'Empty batch received for import {project_import.id}')
                continue

            batch_number += 1
            logger.info(
                f'Processing batch {batch_number} with {len(batch_tasks)} tasks for import {project_import.id}'
            )

            if file_upload_ids and file_upload_ids not in final_file_upload_ids:
                final_file_upload_ids = file_upload_ids
            final_found_formats.update(found_formats)
            final_data_columns.update(data_columns)

            if data_columns and 'label' in data_columns:
                logger.info("Found 'label' column in imported data, attempting to convert to anotations...")
                batch_tasks = convert_label_column_to_label(batch_tasks, project, user)

            if project_import.preannotated_from_fields:
                raise_errors = flag_set(
                    'fflag_feat_utc_210_prediction_validation_15082025', user=project.organization.created_by
                )
                logger.info(f'Reformatting predictions with raise_errors: {raise_errors}')
                batch_tasks = reformat_predictions(
                    batch_tasks, project_import.preannotated_from_fields, project, raise_errors
                )

            if project.label_config_is_not_default and flag_set(
                'fflag_feat_utc_210_prediction_validation_15082025', user=project.organization.created_by
            ):
                validation_errors = []
                li = LabelInterface(project.label_config)

                for i, task in enumerate(batch_tasks):
                    if 'predictions' in task:
                        for j, prediction in enumerate(task['predictions']):
                            try:
                                validation_errors_list = li.validate_prediction(prediction, return_errors=True)
                                if validation_errors_list:
                                    for error in validation_errors_list:
                                        validation_errors.append(
                                            f'Task {total_task_count + i}, prediction {j}: {error}'
                                        )
                            except Exception as e:
                                error_msg = f'Task {total_task_count + i}, prediction {j}: Error validating prediction - {str(e)}'
                                validation_errors.append(error_msg)
                                logger.error(f'Exception during validation: {error_msg}')

                if validation_errors:
                    error_message = f'Prediction validation failed ({len(validation_errors)} errors):\n'
                    for error in validation_errors:
                        error_message += f'- {error}\n'

                    if flag_set(
                        'fflag_feat_utc_210_prediction_validation_15082025', user=project.organization.created_by
                    ):
                        project_import.error = error_message
                        project_import.status = ProjectImport.Status.FAILED
                        project_import.save(update_fields=['error', 'status'])
                        return
                    else:
                        logger.error(
                            f'Prediction validation failed, not raising error - ({len(validation_errors)} errors):\n{error_message}'
                        )

            if project_import.commit_to_project:
                with transaction.atomic():
                    summary = ProjectSummary.objects.select_for_update().get(project=project)

                    serializer = ImportApiSerializer(data=batch_tasks, many=True, context={'project': project})
                    serializer.is_valid(raise_exception=True)
                    batch_db_tasks = serializer.save(project_id=project.id)

                    all_created_task_ids.extend([t.id for t in batch_db_tasks])

                    batch_task_count = len(batch_db_tasks)
                    batch_annotation_count = len(serializer.db_annotations)
                    batch_prediction_count = len(serializer.db_predictions)

                    total_task_count += batch_task_count
                    total_annotation_count += batch_annotation_count
                    total_prediction_count += batch_prediction_count

                    summary.update_data_columns(batch_db_tasks)

            else:
                total_task_count += len(batch_tasks)

            logger.info(f'Batch {batch_number} processed successfully: {len(batch_tasks)} tasks')

        final_data_columns = list(final_data_columns)

        if project_import.commit_to_project and all_created_task_ids:
            logger.info(
                f'Finalizing import: emitting webhooks and updating task states for {len(all_created_task_ids)} tasks'
            )

            emit_webhooks_for_instance(
                user.active_organization, project, WebhookAction.TASKS_CREATED, all_created_task_ids
            )

            recalculate_stats_counts = {
                'task_count': total_task_count,
                'annotation_count': total_annotation_count,
                'prediction_count': total_prediction_count,
            }

            all_tasks_queryset = Task.objects.filter(id__in=all_created_task_ids)
            project.update_tasks_counters_and_task_states(
                tasks_queryset=all_tasks_queryset,
                maximum_annotations_changed=False,
                overlap_cohort_percentage_changed=False,
                tasks_number_changed=True,
                recalculate_stats_counts=recalculate_stats_counts,
            )
            logger.info('Tasks bulk_update finished (async streaming import)')

        duration = time.time() - start

        project_import.task_count = total_task_count or 0
        project_import.annotation_count = total_annotation_count or 0
        project_import.prediction_count = total_prediction_count or 0
        project_import.duration = duration
        project_import.file_upload_ids = final_file_upload_ids
        project_import.found_formats = final_found_formats
        project_import.data_columns = final_data_columns
        if project_import.return_task_ids:
            project_import.task_ids = all_created_task_ids

        project_import.status = ProjectImport.Status.COMPLETED
        project_import.save()

        logger.info(f'Streaming import {project_import.id} completed: {total_task_count} tasks imported')

    except Exception as e:
        logger.error(f'Error in streaming import {project_import.id}: {str(e)}', exc_info=True)
        project_import.status = ProjectImport.Status.FAILED
        project_import.traceback = traceback.format_exc()
        project_import.error = str(e)
        project_import.save()
        raise


def async_reimport_background(reimport_id, organization_id, user, **kwargs):
    print("=== 🟢 START async_reimport_background() ===")

    with transaction.atomic():
        try:
            reimport = ProjectReimport.objects.get(id=reimport_id)
        except ProjectReimport.DoesNotExist:
            logger.error(f'ProjectReimport with id {reimport_id} not found, import processing failed')
            return
        if reimport.status != ProjectReimport.Status.CREATED:
            logger.error(f'Processing reimport with id {reimport_id} already started')
            return
        reimport.status = ProjectReimport.Status.IN_PROGRESS
        reimport.save(update_fields=['status'])

    project = reimport.project

    # Check feature flag for memory improvement
    if flag_set('fflag_fix_back_plt_838_reimport_memory_improvement_05082025_short', user='auto'):
        logger.info(f'Using streaming reimport for project {project.id}')
        _async_reimport_background_streaming(reimport, project, organization_id, user)
    else:
        # Original implementation
        tasks, found_formats, data_columns = FileUpload.load_tasks_from_uploaded_files(
            reimport.project, reimport.file_upload_ids, files_as_tasks_list=reimport.files_as_tasks_list
        )

        if data_columns and 'label' in data_columns:
            logger.info("Found 'label' column in imported data, attempting to convert to anotations...")
            tasks = convert_label_column_to_label(tasks, project, user)

        with transaction.atomic():
            # Lock summary for update to avoid race conditions
            summary = ProjectSummary.objects.select_for_update().get(project=project)

            project.remove_tasks_by_file_uploads(reimport.file_upload_ids)
            serializer = ImportApiSerializer(data=tasks, many=True, context={'project': project, 'user': user})
            serializer.is_valid(raise_exception=True)
            tasks = serializer.save(project_id=project.id)
            emit_webhooks_for_instance(organization_id, project, WebhookAction.TASKS_CREATED, tasks)

            task_count = len(tasks)
            annotation_count = len(serializer.db_annotations)
            prediction_count = len(serializer.db_predictions)

            recalculate_stats_counts = {
                'task_count': task_count,
                'annotation_count': annotation_count,
                'prediction_count': prediction_count,
            }

            # Update counters (like total_annotations) for new tasks and after bulk update tasks stats. It should be a
            # single operation as counters affect bulk is_labeled update
            project.update_tasks_counters_and_task_states(
                tasks_queryset=tasks,
                maximum_annotations_changed=False,
                overlap_cohort_percentage_changed=False,
                tasks_number_changed=True,
                recalculate_stats_counts=recalculate_stats_counts,
            )
            logger.info('Tasks bulk_update finished (async reimport)')

            summary.update_data_columns(tasks)
            # TODO: summary.update_created_annotations_and_labels

        reimport.task_count = task_count
        reimport.annotation_count = annotation_count
        reimport.prediction_count = prediction_count
        reimport.found_formats = found_formats
        reimport.data_columns = list(data_columns)
        reimport.status = ProjectReimport.Status.COMPLETED
        reimport.save()

        post_process_reimport(reimport)
