FROM python:3.13-alpine@sha256:399babc8b49529dabfd9c922f2b5eea81d611e4512e3ed250d75bd2e7683f4b0

RUN addgroup -S -g 10010 adapter \
    && adduser -S -D -H -u 10010 -G adapter adapter

WORKDIR /app
COPY --chown=adapter:adapter app.py /app/app.py

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER adapter
EXPOSE 8080

CMD ["python", "/app/app.py"]
