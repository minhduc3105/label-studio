import csv
import io
import os 
import logging
import xml.etree.ElementTree as ET
from django.db import transaction
from rest_framework.exceptions import ValidationError
from tasks.models import Task, Annotation, Prediction
from .models import FileUpload

logger = logging.getLogger(__name__)

class CSVMergeService:
    """
    Service to merge multiple CSV files into project.
    """

    def __init__(self, project, csv_file, user=None):
        self.project = project
        self.csv_file = csv_file
        self.user = user
        self.task_map = {}
        self.valid_labels = []
        self.valid_labels_set = set()
        self.to_name = None
        self.from_name = None

    def _parse_project_config(self):
        """
        Extract valid labels and from_name/to_name from project config.
        """
        try:
            if not self.project.label_config:
                return
            root = ET.fromstring(self.project.label_config)

            choices_tag = root.find(".//Choices")
            if choices_tag is not None:
                self.from_name = choices_tag.get('name')
                self.to_name = choices_tag.get('toName')
                
                extracted_labels = []
                # --- SỬA LỖI: Logic lấy label an toàn hơn ---
                for choice in choices_tag.findall("Choice"):
                    # Ưu tiên lấy attribute 'value'
                    val = choice.get('value')
                    # Sau đó mới lấy text content
                    text = choice.text

                    if val:
                        extracted_labels.append(val)
                    elif text and text.strip():
                        extracted_labels.append(text.strip())
                
                # Loại bỏ giá trị trùng lặp và giá trị None/Rỗng
                self.valid_labels = list(filter(None, extracted_labels))
                self.valid_labels_set = set(self.valid_labels)

            # Fallback to_name
            if not self.to_name:
                image_tag = root.find(".//Image")
                if image_tag is not None:
                    self.to_name = image_tag.get("name")
            
            logger.info(f"Extracted valid labels: {self.valid_labels}")
        except Exception as e:
            logger.error(f"Error parsing project config: {e}")

    def _build_task_map(self):
        """
        Build a mapping dictionary {original_filename: task_object}
        """
        tasks = Task.objects.filter(project=self.project).select_related('file_upload')

        for task in tasks:
            if not task.file_upload:
                continue
            db_filename = os.path.basename(task.file_upload.file.name)
            try:
                original_filename = db_filename[9:] # Cắt UUID 8 ký tự + 1 gạch nối
                self.task_map[original_filename] = task
            except:
                pass
            self.task_map[db_filename] = task

    def _resolve_label(self, raw_label):
        """
        INPUT: raw label from CSV "0" or "cat"
        OUTPUT: must be "cat" if valid else None
        """
        if raw_label is None:
            return None

        raw_str = str(raw_label).strip()
        
        # Case 1: Index (số)
        if raw_str.isdigit():
            idx = int(raw_str)
            if 0 <= idx < len(self.valid_labels):
                return self.valid_labels[idx]
        
        # Case 2: Text (khớp chính xác)
        if raw_str in self.valid_labels_set:
            return raw_str
        
        # Case 3: Case-insensitive matching
        # --- SỬA LỖI: Thêm check 'if label' để tránh NoneType error ---
        for label in self.valid_labels:
            if label and raw_str.lower() == label.lower():
                return label
                
        return None
    
    def execute(self):
        # Prepare file map & config
        self._build_task_map()
        self._parse_project_config()

        final_from_name = self.from_name or 'choice'
        final_to_name = self.to_name or 'image'

        created_annotations = []
        update_count = 0

        try:
            # Dùng utf-8-sig để xử lý file Excel CSV
            file_wrapper = io.TextIOWrapper(self.csv_file, encoding='utf-8-sig')
            reader = csv.DictReader(file_wrapper)

            if 'image_name' not in reader.fieldnames:
                raise ValidationError(f"The CSV file must contain 'image_name' column. Found: {reader.fieldnames}")
            
            label_col = 'label' if 'label' in reader.fieldnames else None
            if not label_col:
                 for col in reader.fieldnames:
                     if col != 'image_name':
                         label_col = col
                         break
            
            if not label_col:
                raise ValidationError("The CSV file must contain a 'label' column.")
            
            with transaction.atomic():
                for row in reader:
                    image_name = row.get('image_name')
                    raw_label = row.get(label_col)

                    if not image_name or not raw_label:
                        continue
                    
                    # Resolve Label
                    final_label_value = self._resolve_label(raw_label)
                    if not final_label_value:
                        logger.warning(f"Invalid label '{raw_label}' for image '{image_name}'. Skipping.")
                        continue

                    # Find Task
                    existing_task = self.task_map.get(image_name)
                    if not existing_task:
                        logger.warning(f"No matching task found for image '{image_name}'. Skipping.")
                        continue
                    
              
                    # Prepare Annotations
                    created_annotations.append(Annotation(
                        task=existing_task,
                        project=self.project,
                        completed_by=self.user,
                        result=[{
                            "from_name": final_from_name,
                            "to_name": final_to_name,
                            "type": "choices",
                            "value": {
                                "choices": [final_label_value]
                            }
                        }]
                    ))
                    update_count += 1

                # Bulk create OUTSIDE loop
                if created_annotations:
                    Annotation.objects.bulk_create(created_annotations)

        except ValidationError as e:
            raise e
        except Exception as e:
            logger.error(f"Error processing CSV file: {e}", exc_info=True)
            raise ValidationError(f"Error processing CSV file: {e}")
        
        return update_count