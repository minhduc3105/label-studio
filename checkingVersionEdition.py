import os
import django

# Đặt đường dẫn tới settings của project
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'label_studio.settings')
django.setup()

from django.conf import settings

print("VERSION_EDITION =", settings.VERSION_EDITION)
