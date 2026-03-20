FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/outsourc-e/hermes-agent.git /app

WORKDIR /app

# Install uvicorn for the webapi server
RUN pip install --no-cache-dir -e . uvicorn[standard] fastapi

ENV HERMES_WEBAPI_HOST=0.0.0.0
ENV HERMES_WEBAPI_PORT=8642
EXPOSE 8642

CMD ["python", "-m", "webapi"]
