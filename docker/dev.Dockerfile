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
# A Dockerfile to build a development container for WASudoku.

########################################
# Rust versions
ARG RUST_VERSION="1.98.1"
ARG RUST_DISTRO="rust-${RUST_VERSION}-x86_64-unknown-linux-gnu"
ARG RUST_DISTRO_WASM="rust-std-${RUST_VERSION}-wasm32-unknown-unknown"
ARG RUST_DISTRO_SRC="rust-src-${RUST_VERSION}"

########################################
# Node.js versions
ARG NODE_VERSION="24.21.0"
ARG NODE_DISTRO="node-v${NODE_VERSION}-linux-x64"

########################################
# Runtime user configuration
# dev, because dev-base bakes the user it creates and every repository
# shares that image.
ARG USER="dev"
ARG UID="1000"
ARG GID="1000"
ARG CARGO_HOME="/home/${USER}/.local/share/cargo"

# The package mirror to build through. It answers on one network only, so
# resolving the name is the test for reaching it.
ARG APT_MIRROR="http://debian.lan.h3nc4.com"

################################################################################
# Shared builder image
FROM debian:13-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a AS builder-base

ARG APT_MIRROR
RUN host="${APT_MIRROR#http://}"; \
  if [ -n "${host}" ] && getent hosts "${host}" >/dev/null 2>&1; then \
    sed -i "s|^URIs: http://deb.debian.org/|URIs: ${APT_MIRROR}/|" \
      /etc/apt/sources.list.d/debian.sources; \
  fi

RUN apt-get update && apt-get install -y --no-install-recommends \
  gnupg \
  tar \
  xz-utils

################################################################################
# Shared Rust image
FROM builder-base AS rust-base

ADD "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x108F66205EAEB0AAA8DD5E1C85AB96E6FA1BE5FE" "/tmp/rust-key.gpg"

RUN gpg --batch --yes --import <"/tmp/rust-key.gpg"

########################################
# Install toolchain
FROM rust-base AS rust-toolchain
ARG RUST_VERSION
ARG RUST_DISTRO

ADD "https://static.rust-lang.org/dist/${RUST_DISTRO}.tar.xz" /tmp/
ADD "https://static.rust-lang.org/dist/${RUST_DISTRO}.tar.xz.asc" /tmp/

RUN gpg --batch --yes --verify \
  "/tmp/${RUST_DISTRO}.tar.xz.asc" "/tmp/${RUST_DISTRO}.tar.xz" && \
  mkdir -p "/rootfs/opt/rust" "/tmp/rust-installer"
RUN tar -xf "/tmp/${RUST_DISTRO}.tar.xz" -C "/tmp/rust-installer" --strip-components=1 && \
  cd "/tmp/rust-installer" && ./install.sh --prefix="/rootfs/opt/rust"

########################################
# Install wasm32 target
FROM rust-base AS rust-wasm
ARG RUST_VERSION
ARG RUST_DISTRO_WASM

ADD "https://static.rust-lang.org/dist/${RUST_DISTRO_WASM}.tar.xz" /tmp/
ADD "https://static.rust-lang.org/dist/${RUST_DISTRO_WASM}.tar.xz.asc" /tmp/

RUN gpg --batch --yes --verify \
  "/tmp/${RUST_DISTRO_WASM}.tar.xz.asc" "/tmp/${RUST_DISTRO_WASM}.tar.xz" && \
  mkdir -p "/rootfs/opt/rust" "/tmp/rust-installer-wasm"
RUN tar -xf "/tmp/${RUST_DISTRO_WASM}.tar.xz" -C "/tmp/rust-installer-wasm" --strip-components=1 && \
  cd "/tmp/rust-installer-wasm" && ./install.sh --prefix="/rootfs/opt/rust"

########################################
# Install rust source code
FROM rust-base AS rust-src
ARG RUST_VERSION
ARG RUST_DISTRO_SRC

ADD "https://static.rust-lang.org/dist/${RUST_DISTRO_SRC}.tar.xz" /tmp/
ADD "https://static.rust-lang.org/dist/${RUST_DISTRO_SRC}.tar.xz.asc" /tmp/

RUN gpg --batch --yes --verify \
  "/tmp/${RUST_DISTRO_SRC}.tar.xz.asc" "/tmp/${RUST_DISTRO_SRC}.tar.xz" && \
  mkdir -p "/rootfs/opt/rust" "/tmp/rust-installer-src"
RUN tar -xf "/tmp/${RUST_DISTRO_SRC}.tar.xz" -C "/tmp/rust-installer-src" --strip-components=1 && \
  cd "/tmp/rust-installer-src" && ./install.sh --prefix="/rootfs/opt/rust"

########################################
#  Merge all Rust components
FROM builder-base AS rust-stage

# Copy components from each stage
COPY --from=rust-toolchain "/rootfs/" "/rootfs/"
COPY --from=rust-wasm "/rootfs/" "/rootfs/"
COPY --from=rust-src  "/rootfs/" "/rootfs/"

# Symlink binaries into PATH
RUN mkdir -p "/rootfs/usr/local/bin"
RUN cd "/rootfs/usr/local/bin" && ln -s ../../../opt/rust/bin/* .

################################################################################
# Node.js stage
FROM builder-base AS node-stage
ARG NODE_VERSION
ARG NODE_DISTRO

########################################
# Download and verify Node.js
ADD "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt.asc" /tmp/
ADD "https://github.com/nodejs/release-keys/raw/HEAD/gpg/pubring.kbx" /tmp/node-keyring.kbx
ADD "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DISTRO}.tar.xz" /tmp/

RUN gpg --batch --yes --no-default-keyring --keyring /tmp/node-keyring.kbx \
  --trust-model always --decrypt /tmp/SHASUMS256.txt.asc >/tmp/SHASUMS256.txt && \
  cd /tmp && grep "${NODE_DISTRO}.tar.xz" SHASUMS256.txt | sha256sum -c -

########################################
# Install Node.js to /opt/node
RUN mkdir -p "/rootfs/opt/node" "/rootfs/usr/local/bin" && \
  tar -xf "/tmp/${NODE_DISTRO}.tar.xz" -C "/rootfs/opt/node" --strip-components=1

# Symlink node binaries to /usr/local/bin
RUN cd "/rootfs/usr/local/bin" && ln -s ../../../opt/node/bin/* .

################################################################################
# Debian main stage
FROM h3nc4/dev-base:debian-13@sha256:1d854408035d42667be8b3b46e166f30b0ca41dff1583c1f04234f9d39e2ebaa AS main

# dev-base ends as the dev user, and the steps below need root.
USER root

# Not inherited: dev-base sets it while building, and its squashed image does not
# carry it into the runtime environment.
ENV DEBIAN_FRONTEND=noninteractive

########################################
# What rust needs to link, which dev-base does not carry
ARG APT_MIRROR
RUN host="${APT_MIRROR#http://}"; \
  if [ -n "${host}" ] && getent hosts "${host}" >/dev/null 2>&1; then \
    sed -i "s|^URIs: http://deb.debian.org/|URIs: ${APT_MIRROR}/|" \
      /etc/apt/sources.list.d/debian.sources; \
  fi

RUN apt-get update -qq && apt-get install --no-install-recommends -y -qq \
  build-essential \
  pkg-config \
  libssl-dev \
  zlib1g-dev

########################################
# Debugger
RUN apt-get install --no-install-recommends -y -qq \
  lldb

# Copy features from other stages
COPY --from=node-stage /rootfs/ /
COPY --from=rust-stage /rootfs/ /

########################################
# Upgrade npm to the latest version
RUN npm install -g npm@latest

########################################
# Clean cache
RUN apt-get clean && rm -rf /var/lib/apt/lists/* && \
  if [ -n "${APT_MIRROR}" ]; then \
    sed -i "s|^URIs: ${APT_MIRROR}/|URIs: http://deb.debian.org/|" \
      /etc/apt/sources.list.d/debian.sources; \
  fi
RUN rm -rf /var/cache/* /var/log/* /tmp/* /root/.npm

################################################################################
# Final squash image.
FROM scratch AS final
ARG USER
ARG RUST_VERSION
ARG CARGO_HOME
ENV USER="${USER}" \
  RUST_VERSION="${RUST_VERSION}" \
  CARGO_HOME="${CARGO_HOME}" \
  PATH="${CARGO_HOME}/bin:${PATH}" \
  MANPATH="/opt/rust/share/man:/opt/node/share/man:" \
  LANG="en_US.UTF-8" \
  LC_ALL="en_US.UTF-8"

COPY --from=main / /

USER "${USER}"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/sleep", "infinity"]
