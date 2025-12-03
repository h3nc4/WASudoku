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

# NGINX and deps versions
ARG NGINX_VERSION="1.29.3"
ARG NGINX_SHA256="9befcced12ee09c2f4e1385d7e8e21c91f1a5a63b196f78f897c2d044b8c9312"
ARG PCRE2_VERSION="10.47"
ARG PCRE2_SHA256="c08ae2388ef333e8403e670ad70c0a11f1eed021fd88308d7e02f596fcd9dc16"
ARG NGX_BROTLI_COMMIT="a71f9312"
ARG NGX_BROTLI_SHA256="1d21be34f3b7b6d05a8142945e59b3a47665edcdfe0f3ee3d3dbef121f90c08c"
ARG BROTLI_VERSION="1.2.0"
ARG BROTLI_SHA256="816c96e8e8f193b40151dad7e8ff37b1221d019dbcb9c35cd3fadbfe6477dfec"

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
FROM alpine:3.23@sha256:51183f2cfa6320055da30872f211093f9ff1d3cf06f39a0bdb212314c5dc7375 AS nginx-builder
ARG NGINX_VERSION
ARG NGINX_SHA256
ARG PCRE2_VERSION
ARG PCRE2_SHA256
ARG NGX_BROTLI_COMMIT
ARG NGX_BROTLI_SHA256
ARG BROTLI_VERSION
ARG BROTLI_SHA256

# Package installation
RUN apk add --no-cache cmake git gcc make libc-dev linux-headers

# Download and sources
ADD "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" .
ADD "https://github.com/PCRE2Project/pcre2/releases/download/pcre2-${PCRE2_VERSION}/pcre2-${PCRE2_VERSION}.tar.gz" .

# Download NGINX Modules
ADD "https://github.com/google/ngx_brotli/archive/${NGX_BROTLI_COMMIT}.tar.gz" "ngx_brotli-${NGX_BROTLI_COMMIT}.tar.gz"
ADD "https://github.com/google/brotli/archive/refs/tags/v${BROTLI_VERSION}.tar.gz" "brotli-${BROTLI_VERSION}.tar.gz"

# Verify checksums and extract sources
RUN echo "${NGX_BROTLI_SHA256}  ngx_brotli-${NGX_BROTLI_COMMIT}.tar.gz" | sha256sum -c - && \
  echo "${BROTLI_SHA256}  brotli-${BROTLI_VERSION}.tar.gz" | sha256sum -c - && \
  echo "${NGINX_SHA256}  nginx-${NGINX_VERSION}.tar.gz" | sha256sum -c - && \
  echo "${PCRE2_SHA256}  pcre2-${PCRE2_VERSION}.tar.gz" | sha256sum -c - && \
  tar -xzf "nginx-${NGINX_VERSION}.tar.gz" && \
  mkdir "ngx_brotli-${NGX_BROTLI_COMMIT}" && \
  tar -xf "ngx_brotli-${NGX_BROTLI_COMMIT}.tar.gz" --strip-components=1 -C "ngx_brotli-${NGX_BROTLI_COMMIT}" && \
  tar -xf "brotli-${BROTLI_VERSION}.tar.gz" --strip-components=1 -C "ngx_brotli-${NGX_BROTLI_COMMIT}/deps/brotli" && \
  tar -xzf "pcre2-${PCRE2_VERSION}.tar.gz"

RUN mkdir "/ngx_brotli-${NGX_BROTLI_COMMIT}/deps/brotli/out" && cd "/ngx_brotli-${NGX_BROTLI_COMMIT}/deps/brotli/out" && \
  cmake -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_C_FLAGS="-O3 -fPIC" \
  -DCMAKE_INSTALL_PREFIX=installed .. && \
  cmake --build . --config Release --target brotlienc

# Build Nginx
WORKDIR "/nginx-${NGINX_VERSION}"
RUN ./configure \
  --prefix="/run" \
  --pid-path="/run/nginx.pid" \
  --conf-path="/nginx.conf" \
  --error-log-path="/dev/stderr" \
  --http-log-path="/dev/stdout" \
  --with-pcre="../pcre2-${PCRE2_VERSION}" \
  --add-module="../ngx_brotli-${NGX_BROTLI_COMMIT}" \
  --with-http_gzip_static_module \
  --with-http_v2_module \
  --with-http_realip_module \
  --with-http_stub_status_module \
  --with-threads \
  --with-file-aio \
  --without-http_gzip_module \
  --without-http_autoindex_module \
  --without-http_proxy_module \
  --without-http_fastcgi_module \
  --without-http_uwsgi_module \
  --without-http_scgi_module \
  --without-http_grpc_module \
  --without-http_memcached_module \
  --without-http_empty_gif_module \
  --without-http_browser_module \
  --without-http_userid_module \
  --without-http_ssi_module \
  --without-http_mirror_module \
  --without-http_split_clients_module \
  --without-http_geo_module \
  --without-http_map_module \
  --with-cc-opt="-O3 -fdata-sections -ffunction-sections -fomit-frame-pointer -flto" \
  --with-ld-opt="-static -Wl,--gc-sections -fuse-linker-plugin" && \
  make -j"$(nproc)"

# Minify nginx binary
RUN strip --strip-all "objs/nginx"

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
