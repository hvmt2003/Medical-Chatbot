# Use an official lightweight Python image.
# 3.11-slim is a good balance of size and compatibility.
FROM python:3.11-slim

# Set environment variables to optimize Python for containers.
# PYTHONUNBUFFERED=1 ensures logs are visible immediately in Cloud Logging.
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Set the working directory inside the container.
WORKDIR /app

# Copy the requirements file first to leverage Docker cache.
# This speeds up re-builds if only your code changes, not your dependencies.
COPY requirements.txt .

# Install production dependencies.
# --no-cache-dir reduces image size by not storing installation cache.
RUN pip install --no-cache-dir -r requirements.txt

# Install gunicorn, a production-grade WSGI server recommended for Cloud Run.
RUN pip install gunicorn

# Copy the rest of your application code to the container.
COPY . .

# Define the command to run your app on container startup.
# - workers 1: Good for standard Cloud Run instances (can increase for larger ones).
# - threads 8: Allows handling multiple concurrent requests per worker.
# - timeout 0: Disables gunicorn timeout to let Cloud Run manage request timeouts.
# CORRECT: Allows $PORT to be expanded
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app