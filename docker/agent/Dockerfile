FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN git clone https://github.com/outsourc-e/hermes-agent.git /app

RUN pip install --no-cache-dir -e .

EXPOSE 8642

CMD ["python", "-m", "webapi"]
