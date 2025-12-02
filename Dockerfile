# Copyright (C) 2025  Henrique Almeida
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
ARG CI_IMAGE_TAG="latest"

# NGINX version
ARG NGINX_VERSION="1.29.3"
ARG NGINX_SHA256="9befcced12ee09c2f4e1385d7e8e21c91f1a5a63b196f78f897c2d044b8c9312"

################################################################################
# Build stage
FROM h3nc4/wasudoku-ci:${CI_IMAGE_TAG} AS wasudoku-builder

WORKDIR /app

# Install npm dependencies
COPY "package.json" "package-lock.json" ./
RUN npm ci

# Build WASM module
COPY "src/wasudoku-wasm" "./src/wasudoku-wasm"
RUN npm run wasm:build:prod

# Copy source code
COPY "README.md" "LICENSE" *.js *.json *.ts *.html ./
COPY src/ src/
COPY public/ public/

# Build app for production
RUN npm run build

# Create root filesystem
RUN mkdir -p /rootfs && \
  mv /app/dist /rootfs/static

# Pre-compress static assets and remove originals
RUN find "/rootfs/static" -type f \( -name '*.js' -o -name '*.css' -o -name '*.wasm' -o -name '*.json' -o -name '*.svg' \) \
  -exec sh -c 'gzip -9 "$1"' _ {} \; && \
  gzip -9 -k "/rootfs/static/index.html"

################################################################################
# Nginx builder stage
FROM alpine:3.22 AS nginx-builder
ARG NGINX_VERSION
ARG NGINX_SHA256

# Package installation
# Check if openssl-dev can be removed and build-base broken into less packages
RUN apk add --no-cache gcc make libc-dev upx

# Download and sources
ADD "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" .

# Verify and extract sources
RUN echo "${NGINX_SHA256}  nginx-${NGINX_VERSION}.tar.gz" | sha256sum -c - && \
  tar -xzf "nginx-${NGINX_VERSION}.tar.gz"

# Build Nginx
WORKDIR "/nginx-${NGINX_VERSION}"
RUN ./configure \
  --prefix="/run" \
  --pid-path="/run/nginx.pid" \
  --conf-path="/nginx.conf" \
  --error-log-path="/dev/stderr" \
  --http-log-path="/dev/stdout" \
  --without-pcre \
  --without-http_autoindex_module \
  --without-http_rewrite_module \
  --without-http_gzip_module \
  --with-http_gzip_static_module \
  --without-http_proxy_module \
  --without-http_fastcgi_module \
  --without-http_uwsgi_module \
  --without-http_scgi_module \
  --without-http_memcached_module \
  --without-http_empty_gif_module \
  --without-http_browser_module \
  --without-http_userid_module \
  --with-cc-opt="-Os -fdata-sections -ffunction-sections -fomit-frame-pointer -flto" \
  --with-ld-opt="-static -Wl,--gc-sections -fuse-linker-plugin" && \
  make -j"$(nproc)"

# Minify nginx binary
RUN strip --strip-all "objs/nginx" && \
  upx --ultra-brute "objs/nginx"

# Create root filesystem
RUN mkdir -p "/rootfs/run" && \
  mv "objs/nginx" "/rootfs/nginx" && \
  chown -R "65534:65534" "/rootfs/run"

# Copy and minify nginx config
COPY "nginx.conf" "/rootfs/nginx.conf"
RUN sed -E 's/#.*//g;/^[[:space:]]*$/d' "/rootfs/nginx.conf" | tr -d '\n' | tr -s ' ' >"/rootfs/nginx.conf.min" && \
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
