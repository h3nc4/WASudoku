# Copyright (C) 2025-2026  Henrique Almeida
# This file is part of WASudoku.
#
# WASudoku is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# WASudoku is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with WASudoku.  If not, see <https://www.gnu.org/licenses/>.

################################################################################
# A Dockerfile to build a runtime container for WASudoku.

# CI image tag
ARG CI_IMAGE_TAG="latest@sha256:9e66e15a597b080ff40afb4ab8de07af3da96a01500982e3492dabe128b3b08f"

################################################################################
# Build stage
FROM h3nc4/wasudoku-ci:${CI_IMAGE_TAG} AS wasudoku-builder

WORKDIR /app

# Install npm dependencies
COPY "package.json" "package-lock.json" ./
RUN npm ci

# Copy source code. tsc -b also checks the e2e project, and the unit tests import e2e/saves.ts.
COPY "README.md" "LICENSE" *.js *.json *.ts ./
COPY scripts/wasm-build.sh scripts/
COPY src/ src/
COPY e2e/ e2e/
COPY public/ public/

# Build app for production
RUN npm run build

# Create root filesystem and compress assets. _headers is for the edge, and nginx.conf takes its policy.
RUN mkdir -p /rootfs && \
  mv /app/dist /rootfs/static && \
  mv /rootfs/static/_headers /app/_headers

# woff2 and PNG are compressed already, so a copy would only grow the image.
RUN find /rootfs/static -type f ! -name '*.woff2' ! -name '*.png' \
  -exec gzip -9 -k "{}" \; \
  -exec brotli --best -k "{}" \;

################################################################################
# Nginx builder stage
FROM busybox:musl@sha256:80e38f9a1b39188b8bdb28879178edb322a4402b081a9aedda1924609decd6f6 AS nginx-builder

COPY --from=h3nc4/nginx-slim@sha256:f096bcb7ac2e6b7e0dd23b62224559e7e5d9c76efb4747ea7f8917b41e3c7e9b / /rootfs/

# Minify nginx config, with the report-only policy the build wrote for the edge
COPY "nginx.conf" "/tmp/nginx.conf"
COPY "scripts/nginx-conf.sh" "/tmp/nginx-conf.sh"
COPY --from=wasudoku-builder "/app/_headers" "/tmp/_headers"
RUN sh /tmp/nginx-conf.sh /tmp/nginx.conf /tmp/_headers >"/rootfs/nginx.conf"

################################################################################
# Assemble runtime image
FROM scratch AS assemble

COPY --from=wasudoku-builder "/rootfs" "/"
COPY --from=nginx-builder "/rootfs" "/"

################################################################################
# Final squashed image
FROM scratch AS final
ARG VERSION="dev"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"

COPY --from=assemble "/" "/"
USER 65534:65534
CMD ["/nginx", "-c", "/nginx.conf"]

LABEL org.opencontainers.image.title="WASudoku" \
  org.opencontainers.image.description="A WebAssembly Sudoku solver" \
  org.opencontainers.image.authors="Henrique Almeida <me@h3nc4.com>" \
  org.opencontainers.image.vendor="Henrique Almeida" \
  org.opencontainers.image.licenses="AGPL-3.0-or-later" \
  org.opencontainers.image.url="https://wasudoku.h3nc4.com" \
  org.opencontainers.image.source="https://github.com/h3nc4/WASudoku" \
  org.opencontainers.image.documentation="https://github.com/h3nc4/WASudoku/blob/main/README.md" \
  org.opencontainers.image.version="${VERSION}" \
  org.opencontainers.image.revision="${COMMIT_SHA}" \
  org.opencontainers.image.created="${BUILD_DATE}" \
  org.opencontainers.image.ref.name="${VERSION}"
