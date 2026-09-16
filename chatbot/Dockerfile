FROM node:20-alpine

WORKDIR /app

# Copy package files first (better Docker layer caching)
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy source code
COPY src/ ./src/

# Expose the port
EXPOSE 3000

# Start the chatbot
CMD ["node", "src/index.js"]
