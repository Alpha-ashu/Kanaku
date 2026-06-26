# Machine 3 — Grafana + Loki + Vector in ONE Fly machine, run by supervisord.
# DRAFT: pins are real but the build should be iterated once against Fly's remote
# builder at rollout (binary URLs/versions occasionally shift).
FROM debian:bookworm-slim

ARG LOKI_VERSION=3.1.1
ARG VECTOR_VERSION=0.40.1
ARG GRAFANA_VERSION=11.2.0
ARG PROMETHEUS_VERSION=2.54.1

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip supervisor adduser libfontconfig1 \
 && rm -rf /var/lib/apt/lists/*

# Loki (single binary)
RUN curl -fSLo /tmp/loki.zip https://github.com/grafana/loki/releases/download/v${LOKI_VERSION}/loki-linux-amd64.zip \
 && unzip /tmp/loki.zip -d /usr/bin && mv /usr/bin/loki-linux-amd64 /usr/bin/loki \
 && chmod +x /usr/bin/loki && rm /tmp/loki.zip

# Vector (the Fly log-shipper engine)
RUN curl -fSL https://packages.timber.io/vector/${VECTOR_VERSION}/vector-${VECTOR_VERSION}-x86_64-unknown-linux-gnu.tar.gz \
      | tar xz -C /tmp \
 && cp /tmp/vector-x86_64-unknown-linux-gnu/bin/vector /usr/bin/vector && chmod +x /usr/bin/vector

# Prometheus (scrapes kanaku over 6PN)
RUN curl -fSL https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz \
      | tar xz -C /tmp \
 && cp /tmp/prometheus-${PROMETHEUS_VERSION}.linux-amd64/prometheus /usr/bin/prometheus && chmod +x /usr/bin/prometheus

# Grafana (.deb)
RUN curl -fSLo /tmp/grafana.deb https://dl.grafana.com/oss/release/grafana_${GRAFANA_VERSION}_amd64.deb \
 && apt-get update && apt-get install -y /tmp/grafana.deb && rm /tmp/grafana.deb \
 && rm -rf /var/lib/apt/lists/*

COPY prometheus.yml                 /etc/prometheus/prometheus.yml
COPY loki/loki-config.yaml          /etc/loki/loki-config.yaml
COPY log-shipper/vector.toml        /etc/vector/vector.toml
COPY grafana/provisioning           /etc/grafana/provisioning
COPY dashboards                     /var/lib/grafana/dashboards
COPY supervisord.conf               /etc/supervisor/conf.d/observability.conf

# Fail-fast config validation (counterpart to the backend's validateConfig()):
# entrypoint.sh runs validate-config.sh BEFORE supervisord, so a misconfigured
# observability machine refuses to boot instead of coming up half-wired.
COPY validate-config.sh             /usr/local/bin/validate-config.sh
COPY entrypoint.sh                  /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/validate-config.sh /usr/local/bin/entrypoint.sh

EXPOSE 3000 3100
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
