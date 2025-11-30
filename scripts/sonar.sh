#!/bin/sh
#
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
set -e

cd "$(dirname "$0")/../"

sonar_container_name="sonarqube"
sonar_image="sonarqube:25.9.0.112764-community"
sonar_scan_image="sonarsource/sonar-scanner-cli:11"
sonar_url="http://localhost:9000"
project_key="$(grep 'sonar.projectKey' ./sonar-project.properties | cut -d'=' -f2)"

# Adjust paths in coverage reports
if [ -f "coverage-wasm.xml" ]; then
  sed -i "s|<source>/wasudoku|<source>.|" coverage-wasm.xml
fi

# Start pulling scanner image in background
docker pull "${sonar_scan_image}" >/dev/null 2>&1 &
pull_pid=$!

is_running="$(docker ps -q -f "name=${sonar_container_name}")"
if [ -z "${is_running}" ]; then
  is_exited="$(docker ps -aq -f status=exited -f "name=${sonar_container_name}")"
  if [ -n "${is_exited}" ]; then
    docker start "${sonar_container_name}" >/dev/null
  else
    docker run -d \
      --name "${sonar_container_name}" \
      -p 0.0.0.0:9000:9000 \
      -v sonarqube_data:/opt/sonarqube/data \
      -v sonarqube_extensions:/opt/sonarqube/extensions \
      -v sonarqube_logs:/opt/sonarqube/logs \
      -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
      "${sonar_image}" >/dev/null
  fi

  echo "Waiting for SonarQube to start..."
  while ! wget -qO- "${sonar_url}/api/system/status" 2>/dev/null | grep -q 'UP'; do
    sleep 1
  done
  # Configure SonarQube to allow anonymous access
  if ! curl -s -u admin:admin "${sonar_url}/api/settings/values?keys=sonar.forceAuthentication" | grep -q '"value":"false"'; then
    curl -su admin:admin -X POST "${sonar_url}/api/settings/set?key=sonar.forceAuthentication&value=false"
    curl -su admin:admin -X POST "${sonar_url}/api/permissions/add_group?permission=provisioning&groupName=anyone"
    curl -su admin:admin -X POST "${sonar_url}/api/permissions/add_group?permission=scan&groupName=anyone"
  fi
fi

echo "Running SonarQube analysis..."
wait "${pull_pid}"
docker run \
  --rm \
  --network="host" \
  -v "${WASUDOKU_HOST_ROOT:-${PWD}}/:/usr/src" \
  "${sonar_scan_image}" \
  -Dsonar.host.url="${sonar_url}"

sleep 15
if ! curl -s "${sonar_url}/api/issues/search?componentKeys=${project_key}&resolved=false&ps=1" | grep -q '{"total":0,'; then
  echo "ERROR: SonarQube analysis failed. Issues found." >&2
  echo "Check the SonarQube dashboard at ${sonar_url} for more details." >&2
  exit 1
fi
