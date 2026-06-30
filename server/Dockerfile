# Use the official Node.js 18 alpine image
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose port (Cloud Run sets PORT env variable automatically)
EXPOSE 8080

# Start the application
CMD [ "npm", "start" ]
