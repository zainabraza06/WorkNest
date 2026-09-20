# WorkNest AI service
#
# The image is the artifact: models are baked in, not downloaded at boot. Cold starts are
# instant, deploys are immutable, and rolling back is re-tagging an image.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Keep the embedding model inside the image rather than a writable temp dir
    FASTEMBED_CACHE_PATH=/opt/models/fastembed

WORKDIR /app

# Dependencies first so code edits don't invalidate the (slow) install layer
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the 67 MB embedding model into an image layer. Without this the first search after every
# cold start pays a download, and an offline host silently degrades to lexical matching.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5').embed(['warm up'])"

COPY app ./app
COPY models ./models
COPY scripts ./scripts
COPY data/rate_anchors.json ./data/rate_anchors.json

# Fail the build, not production, if the committed models can't be loaded and served by the
# library versions in this image (a pickle built elsewhere is the classic way this breaks).
RUN python -c "\
from app.services.model_registry import price_model, trust_model, versions; \
assert price_model() is not None, 'price model failed to load or failed checksum'; \
assert trust_model() is not None, 'trust model failed to load or failed checksum'; \
print('models verified:', versions())"

# Hugging Face Spaces runs containers as uid 1000 and the filesystem is read-only apart from
# /tmp. Creating that user here means the same image runs unprivileged everywhere.
RUN useradd -m -u 1000 appuser     && chown -R appuser:appuser /app /opt/models
USER appuser

EXPOSE 8000

# Must follow $PORT: hosts like Render inject their own (10000), and a hardcoded port
# would mark a perfectly healthy container as unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/health', timeout=4).status == 200 else 1)"

# Hosts inject $PORT; default to 8000 for local compose
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
