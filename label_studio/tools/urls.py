# D:\ForStudy\label-studio\label_studio\tools\urls.py
from rest_framework.routers import DefaultRouter
from . import views # (Import views từ app "tools" này)

router = DefaultRouter(trailing_slash=False)
router.register(r'api/tools', views.ToolViewSet, basename='tools')

urlpatterns = router.urls