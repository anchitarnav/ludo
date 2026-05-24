FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./
COPY ludo ./ludo
COPY app.py ./
COPY .streamlit ./.streamlit

RUN pip install --no-cache-dir .

EXPOSE 8501

# Single-process deployment is required: room state is in-process memory.
CMD ["streamlit", "run", "app.py", "--server.address=0.0.0.0", "--server.port=8501"]
