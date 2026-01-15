import os 
from dotenv import load_dotenv

load_dotenv()

TEST_ENV_VAL = os.getenv("MINIO_ACCESS_KEY")

print(f"Test Environment Value: {TEST_ENV_VAL}")