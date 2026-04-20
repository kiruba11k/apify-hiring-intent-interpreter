# Use Apify's official Node.js 18 base image
FROM apify/actor-node:18

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm install --omit=dev

# Copy source code
COPY . ./

# Run the actor
CMD ["node", "src/main.js"]
