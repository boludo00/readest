#/bin/bash
docker build -f Dockerfile.combined -t akiraslingshot/mindreader:latest .
docker push akiraslingshot/mindreader:latest 
