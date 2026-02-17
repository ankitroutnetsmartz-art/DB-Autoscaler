FROM node:18

# Install dependencies and the static Docker binary
RUN apt-get update && apt-get install -y curl && \
    curl -L https://download.docker.com/linux/static/stable/x86_64/docker-24.0.5.tgz | tar -xz -C /tmp && \
    mv /tmp/docker/docker /usr/bin/docker && \
    # Install Docker Compose V2 plugin
    mkdir -p /usr/local/lib/docker/cli-plugins && \
    curl -L "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose && \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose && \
    rm -rf /tmp/docker && \
    apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
# Add this line after your Docker installation in the Dockerfile
ENV DOCKER_API_VERSION=1.44
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 5000
CMD ["node", "app.js"]
