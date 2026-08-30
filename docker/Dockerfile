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
ARG CI_IMAGE_TAG="latest@sha256:52ebc0ff2d6aede1b4045a8f9f8fa2700c9f71fa9ee6f4130dbe89f3bf7c233d"

################################################################################
# Build stage
FROM h3nc4/wasudoku-ci:${CI_IMAGE_TAG} AS wasudoku-builder

WORKDIR /app

# Install npm dependencies
COPY "package.json" "package-lock.json" ./
RUN npm ci

# Copy source code
COPY "README.md" "LICENSE" *.js *.json *.ts *.html ./
COPY src/ src/
COPY public/ public/

# Build app for production
RUN npm run build

# Create root filesystem and compress assets
RUN mkdir -p /rootfs && \
  mv /app/dist /rootfs/static

RUN find /rootfs/static -type f \
  -exec gzip -9 -k "{}" \; \
  -exec brotli --best -k "{}" \;

################################################################################
# Nginx builder stage
FROM busybox:musl@sha256:32b5cdad7cce41dfd53d0ae06baebcf8357a147ee7694dc706911c373bc30c37 AS nginx-builder

COPY --from=h3nc4/nginx-slim@sha256:2ee10ebafb924324abf41e7ecf9eaf5bddc007e45e48914d119253fc0f72b005 / /rootfs/

# Copy and minify nginx config
COPY "nginx.conf" "/rootfs/nginx.conf"
RUN \
  # Remove comments and empty lines
  sed -E '/^[[:space:]]*#/d;/^[[:space:]]*$/d' "/rootfs/nginx.conf" | \
  # Remove all newlines to produce a single-line config
  tr -d '\n' | \
  # Compress consecutive spaces into a single space
  tr -s ' ' >"/rootfs/nginx.conf.min" && \
  mv "/rootfs/nginx.conf.min" "/rootfs/nginx.conf"

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
