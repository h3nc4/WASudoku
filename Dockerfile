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
ARG CI_IMAGE_TAG="latest@sha256:262948d36adb56131b9ac3a39adacefb30e4de32b7631448ef260cbdea788596"

# NGINX and deps versions
ARG NGINX_VERSION="1.29.5"
ARG PCRE2_VERSION="10.47"
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
FROM alpine:3.23@sha256:25109184c71bdad752c8312a8623239686a9a2071e8825f20acb8f2198c3f659 AS nginx-builder
ARG NGINX_VERSION
ARG PCRE2_VERSION
ARG NGX_BROTLI_COMMIT
ARG NGX_BROTLI_SHA256
ARG BROTLI_VERSION
ARG BROTLI_SHA256

# Package installation
RUN apk add --no-cache cmake gcc git gnupg libc-dev linux-headers make

# Download brotli modules
ADD "https://github.com/google/ngx_brotli/archive/${NGX_BROTLI_COMMIT}.tar.gz" "ngx_brotli-${NGX_BROTLI_COMMIT}.tar.gz"
ADD "https://github.com/google/brotli/archive/refs/tags/v${BROTLI_VERSION}.tar.gz" "brotli-${BROTLI_VERSION}.tar.gz"

# Verify checksums and extract sources for brotli modules
RUN echo "${NGX_BROTLI_SHA256}  ngx_brotli-${NGX_BROTLI_COMMIT}.tar.gz" | sha256sum -c - && \
  echo "${BROTLI_SHA256}  brotli-${BROTLI_VERSION}.tar.gz" | sha256sum -c - && \
  mkdir "ngx_brotli-${NGX_BROTLI_COMMIT}" && \
  tar -xf "ngx_brotli-${NGX_BROTLI_COMMIT}.tar.gz" --strip-components=1 -C "ngx_brotli-${NGX_BROTLI_COMMIT}" && \
  tar -xf "brotli-${BROTLI_VERSION}.tar.gz" --strip-components=1 -C "ngx_brotli-${NGX_BROTLI_COMMIT}/deps/brotli"

# Build brotli static library
RUN mkdir "/ngx_brotli-${NGX_BROTLI_COMMIT}/deps/brotli/out" && \
  cd "/ngx_brotli-${NGX_BROTLI_COMMIT}/deps/brotli/out" && \
  cmake -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_C_FLAGS="-O3 -fPIC" \
  -DCMAKE_INSTALL_PREFIX=installed .. && \
  cmake --build . --config Release --target brotlienc

# Download NGINX and PCRE2 sources and signatures
ADD "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" .
ADD "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x43387825DDB1BB97EC36BA5D007C8D7C15D87369" "nginx-arut.key"
ADD "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xD6786CE303D9A9022998DC6CC8464D549AF75C0A" "nginx-pluknet.key"
ADD "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x7338973069ED3F443F4D37DFA64FD5B17ADB39A8" "nginx-sb.key"
ADD "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x13C82A63B603576156E30A4EA0EA981B66B0D967" "nginx-thresh.key"
ADD "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz.asc" .
ADD "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xA95536204A3BB489715231282A98E77EB6F24CA8" "pcre2-nicholas-wilson.key"
ADD "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xBACF71F10404D5761C09D392021DE40BFB63B406" "pcre2-philip-hazel.key"
ADD "https://github.com/PCRE2Project/pcre2/releases/download/pcre2-${PCRE2_VERSION}/pcre2-${PCRE2_VERSION}.tar.gz" .
ADD "https://github.com/PCRE2Project/pcre2/releases/download/pcre2-${PCRE2_VERSION}/pcre2-${PCRE2_VERSION}.tar.gz.sig" .

# Verify GPG signatures and extract
RUN gpg --batch --yes --import <"nginx-arut.key" && \
  gpg --batch --yes --import <"nginx-pluknet.key" && \
  gpg --batch --yes --import <"nginx-sb.key" && \
  gpg --batch --yes --import <"nginx-thresh.key" && \
  gpg --batch --yes --import <"pcre2-nicholas-wilson.key" && \
  gpg --batch --yes --import <"pcre2-philip-hazel.key" && \
  gpg --batch --yes --verify "nginx-${NGINX_VERSION}.tar.gz.asc" "nginx-${NGINX_VERSION}.tar.gz" && \
  gpg --batch --yes --verify "pcre2-${PCRE2_VERSION}.tar.gz.sig" "pcre2-${PCRE2_VERSION}.tar.gz"
RUN tar -xzf "nginx-${NGINX_VERSION}.tar.gz" && \
  tar -xzf "pcre2-${PCRE2_VERSION}.tar.gz"

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
