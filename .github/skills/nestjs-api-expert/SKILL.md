---
name: nestjs-api-expert
title: NestJS API Expert
description: Expert skill for creating modular, production-ready NestJS REST APIs using TypeScript, Prisma, and Swagger documentation.
version: 1.1.0
tags: [backend, nestjs, typescript, api, prisma, swagger]
---

# NestJS API Expert Skill

You are an expert backend engineer specializing in NestJS. Use this skill to design, bootstrap, and implement enterprise-grade, highly scalable REST APIs following an opinionated, domain-driven structure.

## Core Architecture Principles

1. **Feature-Driven Modularity:** Organize your code by domain/feature (e.g., `users/`, `recipes/`), not by technical layers (do not separate folders into generic `controllers/` or `services/` globally).
2. **Layered Responsibility:**
   - **Modules:** Handle dependency resolution via encapsulation.
   - **Controllers:** Purely handle incoming HTTP requests, route definitions, and status codes. Do not mix business logic here.
   - **Services/Providers:** Contain core domain and business logic.
3. **Data Integrity:** Always use explicit Data Transfer Objects (DTOs) with `class-validator` for payload parsing.

---

## Core Workflow

### 1. Project Initialization

When asked to create a new project, execute the Nest CLI globally or via `npx`:

```bash
npx @nestjs/cli new <api-name> --package-manager npm
```

### 2. Add Infrastructure Blocks

Install required packages for data validation, Swagger, and Prisma ORM:

```bash
npm i --save @nestjs/swagger swagger-ui-express class-validator class-transformer @prisma/client
npm i --save-dev prisma
```

Initialize Prisma in the workspace:

```bash
npx prisma init
```

### 3. Scaffold a Feature Module

For any new entity or resource (e.g., `items`), generate a complete CRUD feature scaffold containing a module, controller, service, model, and DTO:

```bash
npx nest g resource modules/<feature-name>
```

_Choose REST API and generate CRUD entry points when prompted._

### 4. Absolute Strict File Structure

Enforce this folder layout for any API entity:

```text
src/
├── app.module.ts
├── main.ts
├── prisma/
│   └── prisma.service.ts  # Shared database connection wrapper
└── modules/
    └── <feature>/
        └── <feature>/
            ├── <feature>.controller.ts
            ├── <feature>.module.ts
            ├── <feature>.service.ts
            ├── <feature>.model.ts
            └── create-<feature>.dto.ts
```

      For Firebase-backed features, the service owns the Firestore collection operations, the model defines the persisted record shape, and the DTO types create and update payloads. Register the service in the feature module and import that module from `AppModule`; do not register a feature controller directly in `AppModule`.

---

## Code Quality Standards & Implementations

### Main Entrypoint with OpenAPI/Swagger (`src/main.ts`)

Always enforce global validation stripping, unified route prefixing, and self-documenting Swagger assets:

```typescript
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global API prefix
  app.setGlobalPrefix("api/v1");

  // Enforce structural data validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties missing an explicit validator decorator
      forbidNonWhitelisted: true, // Throw an error if non-whitelisted attributes are passed
      transform: true, // Automatically transform network payloads to their DTO typed instances
    }),
  );

  // Setup Swagger Documentation Layout
  const config = new DocumentBuilder()
    .setTitle("Enterprise NestJS API")
    .setDescription("The core API technical specifications documentation.")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### Prisma Global Connection Service (`src/prisma/prisma.service.ts`)

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.\$connect();
  }

  async onModuleDestroy() {
    await this.\$disconnect();
  }
}
```

### Self-Documenting Data Transfer Object (`src/modules/.../create-dto.ts`)

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from "class-validator";

export class CreateItemDto {
  @ApiProperty({
    example: "Wireless Mouse",
    description: "The display name of the item inventory asset",
  })
  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @ApiProperty({ example: "Ergonomic 2.4GHz mouse", required: false })
  @IsString()
  @IsOptional()
  readonly description?: string;

  @ApiProperty({ example: 25, description: "Current units available in stock" })
  @IsInt()
  @Min(1)
  readonly quantity: number;
}
```

### Controller Routing Pattern (`src/modules/.../controller.ts`)

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ItemsService } from "./items.service";
import { CreateItemDto } from "./dto/create-item.dto";

@ApiTags("items")
@Controller("items")
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @ApiOperation({ summary: "Register a new stock item record" })
  @ApiResponse({
    status: 201,
    description: "The record has been successfully appended.",
  })
  async create(@Body() createItemDto: CreateItemDto) {
    return await this.itemsService.create(createItemDto);
  }

  @Get()
  @ApiOperation({ summary: "Retrieve all existing database line items" })
  async findAll() {
    return await this.itemsService.findAll();
  }

  @Get(":id")
  @ApiOperation({
    summary: "Fetch a single matching entity by its unique ID parameter",
  })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    return await this.itemsService.findOne(id);
  }
}
```

---

## Validation & Verification Checklist

Before declaring any NestJS API element complete, verify the following:

- [ ] No circular module dependencies exist (`arch-avoid-circular-deps`).
- [ ] All numeric route parameters explicitly use `ParseIntPipe` or `ParseUUIDPipe`.
- [ ] The project builds successfully without TypeScript compiler compliance errors (`npm run build`).
- [ ] Every provider is registered as a dependency inside its companion `.module.ts` file.
- [ ] Every feature includes a module, controller, service, model, and DTO with the module imported by `AppModule`.
