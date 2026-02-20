FROM node:18-alpine

# Set the GID from your host (125)
ARG DOCKER_GID=125

WORKDIR /app

# Patch vulnerabilities and install Docker CLI
RUN apk update && apk upgrade && \
    apk add --no-cache docker-cli && \
    addgroup -g ${DOCKER_GID} docker_host && \
    addgroup node docker_host

# Copy package files from the local directory
COPY package*.json ./
RUN npm ci --only=production

# Copy the actual backend code
# Since the Dockerfile is inside the 'backend' folder, '.' refers to 'backend/'
COPY . .

# Run as non-root
USER node

EXPOSE 5000

# Fix: Start app.js directly from the current WORKDIR (/app)
CMD ["node", "app.js"]