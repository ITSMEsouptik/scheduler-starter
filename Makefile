.PHONY: up down logs db api scheduler test lint fmt seed

up:
	docker compose up -d

down:
	docker compose down -v

logs:
	docker compose logs -f --tail=200

db:
	npm run db:setup

api:
	npm run dev:api

scheduler:
	npm run dev:scheduler -- src/scheduler/inprocess.ts $(RUN)

test:
	npm test

lint:
	npm run lint

fmt:
	npm run format
