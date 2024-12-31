# Use a specific Node.js version for better reproducibility
FROM node:23.3.0-slim AS builder

# Install pnpm globally and install necessary build tools
RUN npm install -g pnpm@9.4.0 && \
    apt-get update && \
    apt-get install -y git python3 python3-pip make g++ python3-venv && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Python 3 as the default python
RUN ln -s /usr/bin/python3 /usr/bin/python

# Set the working directory
WORKDIR /app

# Copy package.json and other configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY requirements.txt ./

# Modify Python setup in builder stage
RUN apt-get update && \
    apt-get install -y python3-venv && \
    python3 -m venv /opt/venv
# Activate virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies in venv
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY agent ./agent
COPY packages ./packages
COPY scripts ./scripts
COPY characters ./characters

# Install dependencies and build the project
RUN pnpm install \
    && pnpm build \
    && pnpm prune --prod

# Create a new stage for the final image
FROM node:23.3.0-slim

# Install runtime dependencies including wait-on and Python
RUN npm install -g pnpm@9.4.0 wait-on && \
    apt-get update && \
    apt-get install -y git python3 python3-pip python3-venv && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python requirements and install dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy built artifacts and production dependencies from the builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/agent ./agent
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/characters ./characters

# Copy the virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
# Activate virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Modify the command to use Python scripts instead of bash
CMD python3 scripts/fetch_twitter_creds.py && \
    python3 scripts/fetch_character.py && \
    wait-on characters/character.json && \
    pnpm --filter "@ai16z/agent" start --isRoot --characters="characters/character.json" --non-interactive