FROM n8nio/n8n:latest

USER root

# Make common libraries available inside n8n Code nodes.
RUN mkdir -p /opt/n8n-external && \
    cd /opt/n8n-external && \
    npm init -y && \
    npm install --omit=dev axios lodash dayjs moment uuid zod cheerio

USER node
