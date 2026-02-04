# Documentación del Sistema MDXC

## 1. Diagrama de Entidad-Relación (Base de Datos)

Este diagrama muestra cómo se estructuran y relacionan los datos principales del sistema.

```mermaid
erDiagram
    PROJECT ||--|{ PROJECT_TASK : "tiene"
    PROJECT ||--|{ PROJECT_DOCUMENT : "contiene"
    
    %% Catálogos Maestros (Admin)
    DOCUMENT_DEFINITION ||--|{ FIELD_DEFINITION : "define campos"
    DOCUMENT_DEFINITION ||--o{ PROJECT_TASK : "genera requerimiento"
    DOCUMENT_DEFINITION ||--o{ PROJECT_DOCUMENT : "tipifica"
     
    %% Tablas Principales
    PROJECT {
        uuid id PK
        string title
        string description
        string status
        date working_date
        json metadata "Cliente, Fabricante, etc"
    }

    PROJECT_TASK {
        uuid id PK
        uuid project_id FK
        uuid document_definition_id FK
        string status "PENDING, REQUESTED, UPLOADED..."
        string file_path
    }

    PROJECT_DOCUMENT {
        uuid id PK
        uuid project_id FK
        uuid document_definition_id FK
        string status "REVIEW_NEEDED, VALID"
        json extracted_data "Datos IA"
        string file_path "Ruta Storage"
    }

    DOCUMENT_DEFINITION {
        uuid id PK
        string name
        string code
        boolean is_active
    }

    FIELD_DEFINITION {
        uuid id PK
        uuid document_definition_id FK
        string name
        string key_identifier
        string field_type "texto, fecha, moneda"
        string ai_instructions
    }
```

---

## 2. Flujo de Trabajo del Usuario (User Flow)

Este diagrama ilustra el ciclo de vida de un documento dentro del sistema, desde la creación del proyecto hasta la validación final.

```mermaid
graph TD
    %% Roles
    User((Usuario))
    System[Sistema MDXC]
    AI[Agente IA]

    %% Inicio
    User -->|Crea Proyecto| System
    System -->|Genera Tareas Automáticas| Tasks[Lista de Tareas Pendientes]
    
    %% Flujo Documental
    subgraph Gestión Documental
        Tasks -->|Usuario solicita doc| Pending[Estado: REQUESTED]
        Pending -->|Usuario sube archivo| Upload[Storage: Vault]
        Upload -->|Trigger| AI
        
        AI -->|Extrae Datos| Brain{Análisis IA}
        Brain -->|Éxito| Extracted[Datos JSON en DB]
        Brain -->|Fallo| Error[Alertar Usuario]
        
        Extracted -->|Listo para revisar| Review[Pantalla Validación]
    end

    %% Validación
    subgraph Validación Humana
        Review -->|Comparar IA vs Real| UserCheck{¿Datos Correctos?}
        UserCheck -- No --> Edit[Editar manualmente]
        Edit --> UserCheck
        UserCheck -- Sí --> Confirm[Confirmar y Validar]
        
        Confirm -->|Guardar Definitivo| ValidDB[(Documento VALIDADO)]
    end
    
    ValidDB -->|Disponible para| Reportes[Reportes y Plantillas]
```
