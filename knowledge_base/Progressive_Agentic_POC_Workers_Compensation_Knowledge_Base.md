# Progressive Agentic POC --- Workers' Compensation Data Platform Knowledge Base

> **Purpose:** This document is the domain, metadata, lineage, and
> transformation reference for an AI/agentic SQL assistant operating
> over the synthetic Workers' Compensation Bronze/Silver/Gold pipeline
> in Databricks.
>
> **Data classification:** Synthetic proof-of-concept (POC) data only.
> This is not verified Progressive production data, production schema,
> or authoritative insurance/accounting logic.
>
> **Primary target:** Databricks Delta tables in catalog/schema
> `workspace.default`.
>
> **Intended use by an agent:** Use this document to understand business
> terms, choose the right Gold/Silver/Bronze table, generate joins,
> interpret row counts and policy history, explain lineage, and avoid
> double-counting premiums/charges. When actual table schemas or query
> results contradict this document, trust the live schema and data, and
> flag the discrepancy.

------------------------------------------------------------------------

## 1. Executive summary

The pipeline ingests XML files containing Workers' Compensation policy
transactions and organizes the data into three layers:

1.  **Bronze --- source landing and extraction:** preserve raw XML and
    extract policy-transaction, coverage, and charge rows into separate
    Delta tables.
2.  **Silver --- conformed business data:** standardize and type data,
    maintain a policy jacket per `(source_system, policy_number)`,
    preserve each source transaction separately, and attach child
    coverage/charge rows to the correct Silver policy surrogate key.
3.  **Gold --- reporting model:** create a versioned policy dimension,
    transaction/coverage/charge facts, and a policy reporting summary.
    Gold generates its own surrogate key and resolves it by business
    key; it does not copy Bronze or Silver surrogate IDs.

### Core mental model

**XML document → Bronze extraction → Silver policy + transaction +
coverage + charge → Gold policy-version dimension + facts + summary.**

Bronze is optimized for traceability and reprocessing. Silver is
optimized for clean business entities and relationships. Gold is
optimized for reporting and natural-language/SQL analytics.

### Important sample counts

The five dedicated sample XML files are intended to contain one policy
transaction per file. Each file has three coverage records and two
charge records.

  ------------------------------------------------------------------------------------
  Layer                 Table                              Expected rows after a clean
                                                                             full load
  --------------------- --------------------------------- ----------------------------
  Bronze                `bronze_wc_xml_raw`                                          5

  Bronze                `bronze_wc_policy`                                           5

  Bronze                `bronze_wc_coverage`                                        15

  Bronze                `bronze_wc_charge`                                          10

  Silver                `silver_wc_policy`                                           3

  Silver                `silver_wc_policy_transaction`                               5

  Silver                `silver_wc_coverage`                                        15

  Silver                `silver_wc_charge`                                          10

  Gold                  `gold_dim_policy_jacket`            Up to 5; intended 5 if all
                                                             version keys are distinct

  Gold                  `gold_fact_policy_transaction`                               5

  Gold                  `gold_fact_coverage`                                        15

  Gold                  `gold_fact_charge`                                          10

  Gold                  `gold_policy_reporting_summary`   Up to 5; intended same grain
                                                                as Gold policy-version
                                                                             dimension
  ------------------------------------------------------------------------------------

These are **expected counts, not live query results**. They assume all
target tables were cleared before the run, only the five dedicated files
were processed, each file parsed successfully, and there were no
duplicates or rejected records. Gold version/summary counts depend on
the actual composite business-key values and notebook logic.

Total expected rows across the listed tables (counting the same business
concepts at each layer) are Bronze 35, Silver 33, and Gold up to 40.
These totals are layer row counts, not unique business entities.

------------------------------------------------------------------------

## 2. Environment, paths, and artifacts

### Databricks namespace

-   Catalog: `workspace`
-   Schema: `default`
-   Fully qualified table pattern: `workspace.default.<table_name>`
-   XML volume path: `/Volumes/workspace/default/insurance_poc_files/`

Use the mounted `/Volumes/...` path for local Python file operations in
Databricks. Do not pass a `dbfs:/Volumes/...` URI directly to Python's
built-in `open()`; it is a URI rather than the corresponding local
filesystem path.

### Source files

The five dedicated synthetic XML files are:

  ----------------------------------------------------------------------------------------------------------
  File                                               Policy           Transaction            Revision intent
  -------------------------------------------------- ---------------- ---------------- ---------------------
  `progressive_wc_01_policy_1001_new_business.xml`   WC-1001          New business                         0

  `progressive_wc_02_policy_1001_endorsement.xml`    WC-1001          Endorsement                          1

  `progressive_wc_03_policy_1002_new_business.xml`   WC-1002          New business                         0

  `progressive_wc_04_policy_1003_new_business.xml`   WC-1003          New business                         0

  `progressive_wc_05_policy_1003_cancellation.xml`   WC-1003          Cancellation                         1
  ----------------------------------------------------------------------------------------------------------

Each file is intended to contain exactly one `<Policy>` transaction,
three `<Coverage>` elements, and two `<Charge>` elements.

An older sample named `progressive_workers_compensation_sample.xml`
contains multiple policy transactions in a single XML document. Do not
include that file in the five-file count test unless you intentionally
want to test multi-transaction XML handling. If it is in the input
volume, it can increase counts and may violate the intended
one-transaction-per-file assumption.

### Pipeline artifacts previously created

-   Bronze multi-file ingestion notebook:
    `bronze_workers_compensation_xml_ingestion_multi_file.ipynb`
    (subsequently patched interactively because of inconsistent variable
    names and missing helpers).
-   Silver notebook: `silver_workers_compensation_upsert.ipynb`.
-   Silver DDL: `silver_workers_compensation_ddl.sql`.
-   Gold notebook: `gold_workers_compensation_reporting.ipynb` /
    corrected fixed version.
-   Gold DDL: `gold_workers_compensation_ddl.sql`.

The Silver and Gold table definitions below reflect the available DDL.
The Bronze schema description is based on the ingestion notebook cells
discussed and should be checked against live Bronze DDL before relying
on it as an exact physical schema contract. Notebooks have not been
executed by this assistant against the user's live Databricks workspace.

------------------------------------------------------------------------

## 3. XML source structure and business meaning

The XML is structured around a policy transaction. A simplified example:

``` xml
<WorkersCompensationPolicyTransactions
    schemaVersion="1.0"
    sourceSystem="WORKERS_COMP_ADMIN"
    extractDateTime="2026-10-30T08:30:00-04:00">
  <Policy>
    <PolicyHeader>
      <PolicyID>...</PolicyID>
      <PolicyPrefix>WC</PolicyPrefix>
      <PolicyNumber>WC-1001</PolicyNumber>
      <PolicyRevisionNumber>0</PolicyRevisionNumber>
      <TransactionID>...</TransactionID>
      <TransactionType>NEW_BUSINESS</TransactionType>
      <TransactionStatus>POSTED</TransactionStatus>
      <TransactionDate>2026-01-15</TransactionDate>
      <EffectiveDate>2026-01-15</EffectiveDate>
      <ExpirationDate>2027-01-15</ExpirationDate>
      <PolicyStatus>ACTIVE</PolicyStatus>
      <State>NJ</State>
      <Currency>USD</Currency>
    </PolicyHeader>
    <Producer>...</Producer>
    <Agent>...</Agent>
    <Insured>...</Insured>
    <Risk>...</Risk>
    <Product>
      <Coverages>
        <Coverage>
          <CoverageCode>...</CoverageCode>
          <CoverageName>...</CoverageName>
          <CoverageType>...</CoverageType>
          <ClassCode>...</ClassCode>
          <LimitDescription>...</LimitDescription>
          <Deductible>...</Deductible>
          <WrittenPremium>...</WrittenPremium>
          <AnnualPremium>...</AnnualPremium>
        </Coverage>
      </Coverages>
    </Product>
    <Charges>
      <Charge>
        <ChargeID>...</ChargeID>
        <ChargeType>...</ChargeType>
        <ChargeDescription>...</ChargeDescription>
        <CoverageCode>...</CoverageCode>
        <Amount>...</Amount>
        <Taxable>false</Taxable>
      </Charge>
    </Charges>
  </Policy>
</WorkersCompensationPolicyTransactions>
```

This is an illustrative shape, not a complete schema specification.
Actual XML files are the authority for element names and nesting.

### Main XML sections

  --------------------------------------------------------------------------------------------------------
  XML section                           Business meaning                          Primary destinations
  ------------------------------------- ----------------------------------------- ------------------------
  Root element and file bytes           Source document, feed metadata,           Bronze raw XML table
                                        provenance                                

  `Policy/PolicyHeader`                 Policy number, policy ID, revision,       Bronze policy; Silver
                                        transaction ID/type/status, transaction   policy and transaction;
                                        dates, policy status, state, currency     Gold dimension and
                                                                                  transaction fact

  `Policy/Producer`                     Producer/agency identifiers and display   Bronze policy; Silver
                                        name                                      policy; Gold dimension

  `Policy/Agent`                        Agent identifiers and contact/name        Bronze policy; Silver
                                        attributes                                policy; Gold dimension

  `Policy/Insured`                      Insured ID/type, business name, masked    Bronze policy; Silver
                                        FEIN, address                             policy; Gold dimension
                                                                                  and summary

  `Policy/Insured/BusinessDetails`      Industry code/description, employee       Bronze policy; Silver
                                        count, annual payroll                     policy/transaction as
                                                                                  appropriate; Gold
                                                                                  dimension/fact/summary

  `Policy/Risk`                         Risk ID/state, governing class and        Bronze policy; Silver
                                        risk-level payroll/employee details       policy transaction; Gold
                                                                                  dimension/fact

  `Policy/Product`                      Product code/name and nested coverages    Bronze policy metadata
                                                                                  and coverage records;
                                                                                  Silver policy and
                                                                                  coverage; Gold dimension
                                                                                  and coverage fact

  `Policy/Product/Coverages/Coverage`   Coverage/class/limit/deductible/premium   Bronze coverage → Silver
                                        data                                      coverage → Gold coverage
                                                                                  fact

  `Policy/Charges/Charge`               Fee/surcharge/charge record and amount    Bronze charge → Silver
                                                                                  charge → Gold charge
                                                                                  fact
  --------------------------------------------------------------------------------------------------------

### XML parser behavior

The ingestion logic uses XML parsing to read element text, for example
`PolicyHeader/PolicyNumber`, `Coverage/CoverageCode`, and
`Charge/Amount`. It stores a serialized fragment for the policy,
coverage, or charge where configured, and calculates a SHA-256 digest of
the XML payload.

The discussed notebook logic uses calls similar to
`root.findall("Policy")`, `p.find("PolicyHeader")`, `p.find("Product")`,
`product.find("Coverages")`, and `p.find("Charges")`. These are exact,
namespace-unaware ElementTree lookups. If the XML uses namespaces or
different nesting/tag names, the parser must be adjusted. A zero-row
result from parsing should be treated as a potential parsing/namespace
issue, not proof that the source contains no business records.

------------------------------------------------------------------------

## 4. ER diagrams and relationship model

### 4.1 Physical layer flow

``` mermaid
flowchart TD
    XML[Five XML files] --> RAW[bronze_wc_xml_raw]
    XML --> BP[bronze_wc_policy]
    XML --> BC[bronze_wc_coverage]
    XML --> BQ[bronze_wc_charge]

    BP --> SP[silver_wc_policy]
    BP --> ST[silver_wc_policy_transaction]
    BC --> SC[silver_wc_coverage]
    BQ --> SQ[silver_wc_charge]
    SP --> ST
    SP --> SC
    SP --> SQ

    SP --> GD[gold_dim_policy_jacket]
    ST --> GT[gold_fact_policy_transaction]
    SC --> GC[gold_fact_coverage]
    SQ --> GQ[gold_fact_charge]
    GD --> GT
    GD --> GC
    GD --> GQ
    GD --> SUM[gold_policy_reporting_summary]
    GT --> SUM
    GC --> SUM
    GQ --> SUM
```

This shows logical lineage, not every literal SQL dependency. Gold may
read policy attributes from the Silver policy table and transaction
attributes from the Silver transaction table; child fact rows join to
the versioned Gold dimension using the defined business key.

### 4.2 Silver business relationship ERD

``` mermaid
erDiagram
    SILVER_WC_POLICY ||--o{ SILVER_WC_POLICY_TRANSACTION : has
    SILVER_WC_POLICY_TRANSACTION ||--o{ SILVER_WC_COVERAGE : has
    SILVER_WC_POLICY_TRANSACTION ||--o{ SILVER_WC_CHARGE : has

    SILVER_WC_POLICY {
        BIGINT silver_policy_sk PK
        STRING source_system
        STRING policy_number
    }
    SILVER_WC_POLICY_TRANSACTION {
        STRING source_system
        STRING source_transaction_id
        BIGINT silver_policy_sk FK
        INT policy_revision_number
        STRING transaction_type
    }
    SILVER_WC_COVERAGE {
        STRING source_system
        STRING source_transaction_id
        BIGINT silver_policy_sk FK
        STRING coverage_code
        DECIMAL written_premium
    }
    SILVER_WC_CHARGE {
        STRING source_system
        STRING source_transaction_id
        BIGINT silver_policy_sk FK
        STRING source_charge_id
        DECIMAL amount
    }
```

Relationship interpretation:

-   One Silver policy jacket can have many policy transactions.
-   One transaction can have multiple coverage records.
-   One transaction can have multiple charge records.
-   In the current DDL, coverage and charge tables carry both
    `source_transaction_id` and `silver_policy_sk`. Their
    `source_transaction_id` is the transaction-level lineage/business
    identifier; `silver_policy_sk` links to the policy jacket.
-   These are logical relationships; the Delta tables do not necessarily
    enforce relational foreign-key constraints.

### 4.3 Gold reporting ERD

``` mermaid
erDiagram
    GOLD_DIM_POLICY_JACKET ||--o{ GOLD_FACT_POLICY_TRANSACTION : describes
    GOLD_DIM_POLICY_JACKET ||--o{ GOLD_FACT_COVERAGE : describes
    GOLD_DIM_POLICY_JACKET ||--o{ GOLD_FACT_CHARGE : describes
    GOLD_DIM_POLICY_JACKET ||--o| GOLD_POLICY_REPORTING_SUMMARY : summarizes

    GOLD_DIM_POLICY_JACKET {
        BIGINT gold_policy_sk PK
        STRING source_system
        STRING policy_number
        INT policy_revision_number
        DATE effective_date
    }
    GOLD_FACT_POLICY_TRANSACTION {
        STRING source_system
        STRING source_transaction_id
        BIGINT gold_policy_sk FK
        DECIMAL written_premium_total
        DECIMAL charges_total
        DECIMAL total_cost_estimate
    }
    GOLD_FACT_COVERAGE {
        STRING source_system
        STRING source_transaction_id
        BIGINT gold_policy_sk FK
        STRING coverage_code
        DECIMAL written_premium
        DECIMAL annual_premium
    }
    GOLD_FACT_CHARGE {
        STRING source_system
        STRING source_transaction_id
        STRING source_charge_id
        BIGINT gold_policy_sk FK
        DECIMAL amount
    }
    GOLD_POLICY_REPORTING_SUMMARY {
        STRING source_system
        STRING policy_number
        INT policy_revision_number
        DATE effective_date
        BIGINT gold_policy_sk FK
        DECIMAL total_cost_estimate
    }
```

The Gold dimension is versioned. A row is identified by the composite
business key
`(source_system, policy_number, policy_revision_number, effective_date)`,
subject to the actual MERGE behavior and treatment of null effective
dates.

------------------------------------------------------------------------

## 5. Table inventory and grain

**Grain** means what one row represents. Always establish grain before
joining or aggregating tables.

  ------------------------------------------------------------------------------------------------------------------------------------
  Layer             Table                                               Grain                                      Main purpose
  ----------------- --------------------------------------------------- ------------------------------------------ -------------------
  Bronze            `workspace.default.bronze_wc_xml_raw`               One row per ingested XML file/ingestion    Raw payload and
                                                                        event, according to implementation         provenance

  Bronze            `workspace.default.bronze_wc_policy`                One row per policy transaction parsed from Header and
                                                                        the XML                                    policy-level
                                                                                                                   attributes for that
                                                                                                                   transaction

  Bronze            `workspace.default.bronze_wc_coverage`              One row per coverage element within a      Coverage and
                                                                        policy transaction                         premium detail

  Bronze            `workspace.default.bronze_wc_charge`                One row per charge element within a policy Fee/surcharge
                                                                        transaction                                detail

  Silver            `workspace.default.silver_wc_policy`                One row per                                Conformed policy
                                                                        `(source_system, policy_number)`           jacket

  Silver            `workspace.default.silver_wc_policy_transaction`    One row per                                Transaction history
                                                                        `(source_system, source_transaction_id)`   

  Silver            `workspace.default.silver_wc_coverage`              One row per coverage in a source           Standardized
                                                                        transaction, based on the configured       coverage detail
                                                                        source/business key                        

  Silver            `workspace.default.silver_wc_charge`                One row per charge in a source             Standardized charge
                                                                        transaction, based on the configured       detail
                                                                        source/business key                        

  Gold              `workspace.default.gold_dim_policy_jacket`          One row per policy version composite key   Reporting dimension

  Gold              `workspace.default.gold_fact_policy_transaction`    One row per source transaction             Transaction-level
                                                                                                                   reporting and
                                                                                                                   financial measures

  Gold              `workspace.default.gold_fact_coverage`              One row per source transaction coverage    Coverage/premium
                                                                                                                   analysis

  Gold              `workspace.default.gold_fact_charge`                One row per source transaction charge      Charge analysis

  Gold              `workspace.default.gold_policy_reporting_summary`   One row per policy version, intended to    Aggregated
                                                                        align with the Gold dimension              reporting metrics
  ------------------------------------------------------------------------------------------------------------------------------------

Bronze raw ingestion grain can be per file or per file ingestion event
depending on how reruns are handled. Since the Bronze writes discussed
use append mode, rerunning can create multiple rows for the same file
unless deduplication is implemented.

------------------------------------------------------------------------

## 6. Bronze layer: tables and column-level data dictionary

### 6.1 `workspace.default.bronze_wc_xml_raw`

**Purpose:** Preserve the XML source so that data can be traced back to
its original payload and reparsed if the transformation logic changes.

Typical data elements include:

  -----------------------------------------------------------------------
  Field/concept                       Meaning
  ----------------------------------- -----------------------------------
  Source file name/path               Which input file was read

  Raw XML payload                     Original XML document content

  SHA-256 hash                        Content fingerprint for
                                      comparison/lineage

  Ingestion timestamp                 When the pipeline read/loaded the
                                      document

  Source/feed metadata                If extracted by the implementation,
                                      attributes such as source system,
                                      schema version, extract timestamp
  -----------------------------------------------------------------------

The exact physical column names must be checked in the actual Bronze
DDL/notebook. Do not assume a guessed raw-payload column name in SQL.

### 6.2 `workspace.default.bronze_wc_policy`

**Purpose:** One extracted policy transaction row per `<Policy>`
element.

Fields used by the discussed policy/coverage/charge parsing cells
include the following. The exact physical schema should be confirmed
against the Bronze table DDL.

  -----------------------------------------------------------------------------------------------
  Column                     XML source / derivation                      Meaning
  -------------------------- -------------------------------------------- -----------------------
  `source_file_name`         Input file metadata                          Source filename

  `file_sha256`              SHA-256 of XML payload                       Source content
                                                                          fingerprint

  `policy_id`                `Policy/PolicyHeader/PolicyID`               Source policy
                                                                          identifier; lineage
                                                                          field, not Silver
                                                                          surrogate key

  `policy_number`            `Policy/PolicyHeader/PolicyNumber`           Business policy number

  `policy_prefix`            `Policy/PolicyHeader/PolicyPrefix`           Policy prefix/product
                                                                          grouping indicator

  `policy_revision_number`   `Policy/PolicyHeader/PolicyRevisionNumber`   Version/revision number
                                                                          for the policy

  `transaction_id`           `Policy/PolicyHeader/TransactionID`          Source transaction
                                                                          identifier

  `transaction_type`         `Policy/PolicyHeader/TransactionType`        New business,
                                                                          endorsement,
                                                                          cancellation, etc.

  `transaction_date`         `Policy/PolicyHeader/TransactionDate`        Date of transaction

  `transaction_status`       `Policy/PolicyHeader/TransactionStatus`      Transaction processing
                                                                          status

  `effective_date`           `Policy/PolicyHeader/EffectiveDate`          Policy term effective
                                                                          date

  `expiration_date`          `Policy/PolicyHeader/ExpirationDate`         Policy term expiration
                                                                          date

  `policy_status`            `Policy/PolicyHeader/PolicyStatus`           Status of the policy

  `state`                    `Policy/PolicyHeader/State`                  State associated with
                                                                          policy/transaction

  `currency`                 `Policy/PolicyHeader/Currency`               Currency code

  Insured fields             `Policy/Insured/...`                         Insured identity, type,
                                                                          business name, masked
                                                                          FEIN and address

  Producer fields            `Policy/Producer/...`                        Producer
                                                                          ID/code/name/type

  Agent fields               `Policy/Agent/...`                           Agent ID/name/email

  Product fields             `Policy/Product/...`                         Product code/name and
                                                                          related attributes

  Risk fields                `Policy/Risk/...`                            Risk ID/state, class
                                                                          code/description,
                                                                          employees/payroll where
                                                                          present

  `raw_policy_xml`           Serialized `<Policy>` element                Policy XML fragment for
                                                                          traceability

  `ingested_at_utc`          Ingestion runtime timestamp                  Timestamp assigned by
                                                                          ingestion
  -----------------------------------------------------------------------------------------------

The parser cells shown in the conversation explicitly extract the header
fields and reference `raw_policy_xml` and ingestion metadata. Additional
insured/producer/agent/product/risk columns depend on the full policy
parser cell and Bronze DDL.

### 6.3 `workspace.default.bronze_wc_coverage`

**Purpose:** One row per `<Coverage>` element. The discussed parser
extracts these fields:

  ----------------------------------------------------------------------------------------------
  Column                     XML source / derivation                     Meaning
  -------------------------- ------------------------------------------- -----------------------
  `source_file_name`         Input file metadata                         File lineage

  `file_sha256`              SHA-256 of XML payload                      File content
                                                                         fingerprint

  `policy_id`                Header `PolicyID`                           Source policy
                                                                         identifier

  `policy_number`            Header `PolicyNumber`                       Policy business key

  `policy_prefix`            Header `PolicyPrefix`                       Policy prefix

  `policy_revision_number`   Header `PolicyRevisionNumber`               Policy revision

  `transaction_id`           Header `TransactionID`                      Transaction identifier
                                                                         for parent policy event

  `transaction_type`         Header `TransactionType`                    Transaction type

  `transaction_date`         Header `TransactionDate`                    Transaction date

  `transaction_status`       Header `TransactionStatus`                  Transaction status

  `state`                    Header `State`                              State

  `coverage_code`            `Product/Coverages/Coverage/CoverageCode`   Coverage code

  `coverage_name`            `.../CoverageName`                          Coverage display name

  `coverage_description`     `.../CoverageDescription`                   Description

  `coverage_type`            `.../CoverageType`                          Coverage category/type

  `class_code`               `.../ClassCode`                             Workers' Compensation
                                                                         class code

  `class_description`        `.../ClassDescription`                      Class description

  `limit_description`        `.../LimitDescription`                      Limit text/description

  `deductible`               `.../Deductible`                            Deductible value;
                                                                         Bronze may store source
                                                                         text

  `written_premium`          `.../WrittenPremium`                        Written premium for
                                                                         coverage

  `annual_premium`           `.../AnnualPremium`                         Annualized premium for
                                                                         coverage

  `raw_coverage_xml`         Serialized `<Coverage>` element             Raw coverage fragment

  `ingested_at_utc`          Ingestion runtime timestamp                 Ingestion timestamp
  ----------------------------------------------------------------------------------------------

### 6.4 `workspace.default.bronze_wc_charge`

**Purpose:** One row per `<Charge>` element.

  ------------------------------------------------------------------------------
  Column                     XML source / derivation     Meaning
  -------------------------- --------------------------- -----------------------
  `source_file_name`         Input file metadata         File lineage

  `file_sha256`              SHA-256 of XML payload      File content
                                                         fingerprint

  `policy_id`                Header `PolicyID`           Source policy
                                                         identifier

  `policy_number`            Header `PolicyNumber`       Policy business key

  `policy_prefix`            Header `PolicyPrefix`       Policy prefix

  `policy_revision_number`   Header                      Policy revision
                             `PolicyRevisionNumber`      

  `transaction_id`           Header `TransactionID`      Parent transaction
                                                         identifier

  `transaction_type`         Header `TransactionType`    Transaction type

  `transaction_date`         Header `TransactionDate`    Transaction date

  `transaction_status`       Header `TransactionStatus`  Transaction status

  `state`                    Header `State`              State

  `charge_id`                `Charges/Charge/ChargeID`   Source charge
                                                         identifier

  `charge_type`              `.../ChargeType`            Charge category

  `charge_description`       `.../ChargeDescription`     Charge description

  `coverage_code`            `.../CoverageCode`          Coverage association
                                                         when provided

  `amount`                   `.../Amount`                Charge amount

  `taxable`                  `.../Taxable`               Whether the charge is
                                                         taxable

  `raw_charge_xml`           Serialized `<Charge>`       Raw charge fragment
                             element                     

  `ingested_at_utc`          Ingestion runtime timestamp Ingestion timestamp
  ------------------------------------------------------------------------------

### Bronze transformation rules

-   Preserve source text and raw fragments where implemented.
-   Extract policy/header values into policy, coverage, and charge rows
    to make downstream querying easier.
-   Carry source file name and hash for lineage.
-   Bronze fields may remain strings even when values represent dates,
    numbers, or booleans; Silver is where typed columns are established.
-   Bronze writes discussed use `mode("append")`. Append is not
    automatically idempotent.
-   Do not treat `policy_id` as a warehouse surrogate key.
-   Do not assume one XML file equals one row in every Bronze table:
    child elements fan out to multiple rows.

------------------------------------------------------------------------

## 7. Silver layer: exact table schema and semantics

Silver DDL uses Delta tables and typed columns. The DDL below is the
source of truth for the documented Silver physical columns.

### 7.1 `workspace.default.silver_wc_policy`

**Grain:** One policy jacket per `(source_system, policy_number)`.

  ---------------------------------------------------------------------------------
  Column                            Type                    Meaning
  --------------------------------- ----------------------- -----------------------
  `silver_policy_sk`                BIGINT identity         Silver-owned surrogate
                                                            policy key

  `source_system`                   STRING, not null        Source system name

  `policy_prefix`                   STRING                  Policy prefix

  `policy_number`                   STRING, not null        Policy business key

  `insured_id`                      STRING                  Source insured ID

  `insured_type`                    STRING                  Insured type

  `business_name`                   STRING                  Insured business name

  `fein_masked`                     STRING                  Masked federal employer
                                                            ID

  `street`                          STRING                  Mailing street

  `city`                            STRING                  Mailing city

  `insured_state`                   STRING                  Insured mailing state

  `postal_code`                     STRING                  Postal/ZIP code

  `country`                         STRING                  Country

  `producer_id`                     STRING                  Producer identifier

  `producer_code`                   STRING                  Producer code

  `producer_name`                   STRING                  Producer/agency name

  `agent_id`                        STRING                  Agent identifier

  `agent_first_name`                STRING                  Agent first name

  `agent_last_name`                 STRING                  Agent last name

  `agent_email`                     STRING                  Agent email

  `product_code`                    STRING                  Product code

  `product_name`                    STRING                  Product name

  `policy_state`                    STRING                  Policy state/status
                                                            attribute as mapped by
                                                            notebook

  `currency`                        STRING                  Currency code

  `industry_code`                   STRING                  Industry code

  `industry_description`            STRING                  Industry description

  `employee_count`                  INT                     Employee count

  `annual_payroll`                  DECIMAL(18,2)           Annual payroll

  `latest_transaction_date`         DATE                    Latest transaction date
                                                            selected by the Silver
                                                            logic

  `latest_policy_revision_number`   INT                     Latest revision number
                                                            selected by Silver
                                                            logic

  `created_at_utc`                  TIMESTAMP               Warehouse create
                                                            timestamp

  `updated_at_utc`                  TIMESTAMP               Warehouse update
                                                            timestamp
  ---------------------------------------------------------------------------------

**Key rule:** `silver_policy_sk` is generated by Silver identity. It is
not copied from Bronze `policy_id`. The policy jacket MERGE uses
`(source_system, policy_number)`.

**Latest fields:** `latest_transaction_date` and
`latest_policy_revision_number` are derived from the transaction/policy
source records according to the notebook's selection logic. They are
jacket-level attributes, not a replacement for the full transaction
history.

### 7.2 `workspace.default.silver_wc_policy_transaction`

**Grain:** One row per source transaction, identified by
`(source_system, source_transaction_id)` in the intended design.

  -------------------------------------------------------------------------------
  Column                          Type                    Meaning
  ------------------------------- ----------------------- -----------------------
  `source_system`                 STRING, not null        Source system

  `source_transaction_id`         STRING, not null        Source transaction ID

  `silver_policy_sk`              BIGINT, not null        Lookup to Silver policy
                                                          jacket

  `source_policy_id`              STRING                  Original source policy
                                                          ID, retained for
                                                          lineage

  `policy_revision_number`        INT                     Revision number

  `transaction_type`              STRING                  New business,
                                                          endorsement,
                                                          cancellation, etc.

  `transaction_status`            STRING                  Source transaction
                                                          status

  `transaction_date`              DATE                    Transaction date

  `effective_date`                DATE                    Policy effective date

  `expiration_date`               DATE                    Policy expiration date

  `policy_status`                 STRING                  Policy status

  `state`                         STRING                  State

  `currency`                      STRING                  Currency

  `risk_id`                       STRING                  Risk identifier

  `risk_state`                    STRING                  Risk state

  `governing_class_code`          STRING                  Governing Workers'
                                                          Compensation class code

  `governing_class_description`   STRING                  Governing class
                                                          description

  `risk_employee_count`           INT                     Employees associated
                                                          with risk

  `risk_annual_payroll`           DECIMAL(18,2)           Annual payroll for risk

  `source_file_name`              STRING                  Input file name

  `file_sha256`                   STRING                  Input XML content hash

  `ingested_at_utc`               TIMESTAMP               Source ingestion
                                                          timestamp

  `created_at_utc`                TIMESTAMP               Warehouse create
                                                          timestamp

  `updated_at_utc`                TIMESTAMP               Warehouse update
                                                          timestamp
  -------------------------------------------------------------------------------

The Silver transaction key references the policy jacket by joining
`(source_system, policy_number)` to `silver_wc_policy`. The transaction
ID identifies the event; it does not identify the policy jacket.

### 7.3 `workspace.default.silver_wc_coverage`

**Grain:** One coverage record in a source transaction.

  -------------------------------------------------------------------------
  Column                    Type                    Meaning
  ------------------------- ----------------------- -----------------------
  `source_system`           STRING, not null        Source system

  `source_transaction_id`   STRING, not null        Parent transaction
                                                    identifier

  `silver_policy_sk`        BIGINT, not null        Silver policy jacket
                                                    lookup

  `coverage_code`           STRING, not null        Coverage code

  `coverage_name`           STRING                  Coverage name

  `coverage_description`    STRING                  Coverage description

  `coverage_type`           STRING                  Coverage type

  `class_code`              STRING                  Class code

  `class_description`       STRING                  Class description

  `limit_description`       STRING                  Limit description

  `deductible`              DECIMAL(18,2)           Numeric deductible,
                                                    where applicable

  `written_premium`         DECIMAL(18,2)           Written premium

  `annual_premium`          DECIMAL(18,2)           Annual premium

  `source_file_name`        STRING                  Input file name

  `file_sha256`             STRING                  Source hash

  `ingested_at_utc`         TIMESTAMP               Ingestion timestamp

  `created_at_utc`          TIMESTAMP               Warehouse create
                                                    timestamp

  `updated_at_utc`          TIMESTAMP               Warehouse update
                                                    timestamp
  -------------------------------------------------------------------------

The Silver notebook must parse source text to appropriate decimal types.
Invalid numeric strings should be investigated rather than silently
interpreted as valid financial values.

### 7.4 `workspace.default.silver_wc_charge`

**Grain:** One charge record in a source transaction.

  -------------------------------------------------------------------------
  Column                    Type                    Meaning
  ------------------------- ----------------------- -----------------------
  `source_system`           STRING, not null        Source system

  `source_transaction_id`   STRING, not null        Parent transaction
                                                    identifier

  `silver_policy_sk`        BIGINT, not null        Silver policy jacket
                                                    lookup

  `source_charge_id`        STRING, not null        Source charge ID;
                                                    mapped from Bronze
                                                    `charge_id`

  `charge_type`             STRING                  Charge type

  `charge_description`      STRING                  Charge description

  `coverage_code`           STRING                  Coverage associated
                                                    with charge, if
                                                    provided

  `amount`                  DECIMAL(18,2)           Charge amount

  `taxable`                 BOOLEAN                 Taxable flag

  `source_file_name`        STRING                  Source filename

  `file_sha256`             STRING                  Source hash

  `ingested_at_utc`         TIMESTAMP               Ingestion timestamp

  `created_at_utc`          TIMESTAMP               Warehouse create
                                                    timestamp

  `updated_at_utc`          TIMESTAMP               Warehouse update
                                                    timestamp
  -------------------------------------------------------------------------

### Silver transformation rules

1.  Read Bronze policy, coverage, and charge tables.
2.  Derive/standardize `source_system`.
3.  Cast date fields to `DATE`, numeric fields to `INT` or
    `DECIMAL(18,2)`, and taxable values to `BOOLEAN`.
4.  Upsert policy jackets using `(source_system, policy_number)`.
5.  Use the generated `silver_policy_sk` to attach each transaction,
    coverage, and charge to the correct policy jacket.
6.  Upsert transaction records using source transaction identity; child
    records use configured source/business keys.
7.  Retain source IDs and lineage fields for traceability.
8.  Validate expected counts and null/missing surrogate key lookups.

The Silver notebook uses Delta `MERGE` upserts. The intended result is
that rerunning with the same Bronze dataset updates matching logical
records rather than blindly appending duplicates. This depends on the
actual MERGE keys and on source staging being deduplicated before MERGE.

------------------------------------------------------------------------

## 8. Gold layer: exact schema and semantics

Gold generates `gold_policy_sk` using its own identity column. It does
not reuse `silver_policy_sk` as the Gold surrogate key.

### 8.1 `workspace.default.gold_dim_policy_jacket`

**Grain:** One versioned policy jacket per
`(source_system, policy_number, policy_revision_number, effective_date)`.

  -------------------------------------------------------------------------------
  Column                          Type                    Meaning
  ------------------------------- ----------------------- -----------------------
  `gold_policy_sk`                BIGINT identity         Gold-owned surrogate
                                                          key

  `source_system`                 STRING, not null        Source system

  `policy_number`                 STRING, not null        Policy business number

  `policy_prefix`                 STRING                  Prefix

  `policy_revision_number`        INT, not null           Policy revision/version

  `effective_date`                DATE                    Effective date of
                                                          version

  `expiration_date`               DATE                    Expiration date

  `transaction_date`              DATE                    Transaction date
                                                          represented by the
                                                          dimension row

  `transaction_type`              STRING                  Transaction type
                                                          represented by the row

  `transaction_status`            STRING                  Transaction status

  `policy_status`                 STRING                  Policy status

  `insured_id`                    STRING                  Insured ID

  `insured_type`                  STRING                  Insured type

  `business_name`                 STRING                  Insured business name

  `insured_state`                 STRING                  Insured state

  `postal_code`                   STRING                  Insured postal code

  `producer_code`                 STRING                  Producer code

  `producer_name`                 STRING                  Producer name

  `agent_first_name`              STRING                  Agent first name

  `agent_last_name`               STRING                  Agent last name

  `product_code`                  STRING                  Product code

  `product_name`                  STRING                  Product name

  `currency`                      STRING                  Currency

  `industry_code`                 STRING                  Industry code

  `industry_description`          STRING                  Industry description

  `employee_count`                INT                     Employee count

  `annual_payroll`                DECIMAL(18,2)           Annual payroll

  `governing_class_code`          STRING                  Governing class code

  `governing_class_description`   STRING                  Governing class
                                                          description

  `source_transaction_id`         STRING                  Transaction used to
                                                          represent this version

  `source_file_name`              STRING                  Source filename

  `file_sha256`                   STRING                  Source XML hash

  `created_at_utc`                TIMESTAMP               Warehouse create
                                                          timestamp

  `updated_at_utc`                TIMESTAMP               Warehouse update
                                                          timestamp
  -------------------------------------------------------------------------------

**Business key:**
`(source_system, policy_number, policy_revision_number, effective_date)`.
Confirm null effective-date behavior in MERGE and uniqueness checks. If
multiple transactions share the same four key values, they map to the
same dimension business key unless the notebook adds another
discriminator.

### 8.2 `workspace.default.gold_fact_policy_transaction`

**Grain:** One source policy transaction.

  --------------------------------------------------------------------------
  Column                     Type                    Meaning
  -------------------------- ----------------------- -----------------------
  `source_system`            STRING, not null        Source system

  `source_transaction_id`    STRING, not null        Source transaction ID

  `gold_policy_sk`           BIGINT, not null        Gold dimension lookup

  `policy_number`            STRING, not null        Policy number

  `policy_revision_number`   INT                     Revision

  `effective_date`           DATE                    Effective date

  `expiration_date`          DATE                    Expiration date

  `transaction_date`         DATE                    Transaction date

  `transaction_type`         STRING                  New business,
                                                     endorsement,
                                                     cancellation, etc.

  `transaction_status`       STRING                  Transaction status

  `policy_status`            STRING                  Policy status

  `state`                    STRING                  State

  `currency`                 STRING                  Currency

  `employee_count`           INT                     Employee count

  `annual_payroll`           DECIMAL(18,2)           Annual payroll

  `written_premium_total`    DECIMAL(18,2)           Sum of written premiums
                                                     for the transaction's
                                                     coverage rows

  `annual_premium_total`     DECIMAL(18,2)           Sum of annual premiums
                                                     for the transaction's
                                                     coverage rows

  `charges_total`            DECIMAL(18,2)           Sum of charges for the
                                                     transaction

  `total_cost_estimate`      DECIMAL(18,2)           POC estimate combining
                                                     written premium total
                                                     and charges total

  `source_file_name`         STRING                  Source filename

  `file_sha256`              STRING                  Source hash

  `created_at_utc`           TIMESTAMP               Warehouse create
                                                     timestamp

  `updated_at_utc`           TIMESTAMP               Warehouse update
                                                     timestamp
  --------------------------------------------------------------------------

**Metric caveat:** In this POC, `total_cost_estimate` is intended to be
`written_premium_total + charges_total`. This is an illustrative
reporting calculation, not an approved insurance/accounting definition.
Do not substitute annual premium for written premium or claim that the
estimate is a bill amount without business validation.

### 8.3 `workspace.default.gold_fact_coverage`

**Grain:** One coverage record in one source transaction.

  --------------------------------------------------------------------------
  Column                     Type                    Meaning
  -------------------------- ----------------------- -----------------------
  `source_system`            STRING, not null        Source system

  `source_transaction_id`    STRING, not null        Transaction ID

  `gold_policy_sk`           BIGINT, not null        Gold policy-version
                                                     dimension key

  `policy_number`            STRING, not null        Policy number

  `policy_revision_number`   INT                     Revision

  `effective_date`           DATE                    Effective date

  `coverage_code`            STRING, not null        Coverage code

  `coverage_name`            STRING                  Coverage name

  `coverage_description`     STRING                  Description

  `coverage_type`            STRING                  Type

  `class_code`               STRING                  Class code

  `class_description`        STRING                  Class description

  `limit_description`        STRING                  Limit

  `deductible`               DECIMAL(18,2)           Deductible

  `written_premium`          DECIMAL(18,2)           Written premium

  `annual_premium`           DECIMAL(18,2)           Annual premium

  `created_at_utc`           TIMESTAMP               Warehouse create
                                                     timestamp

  `updated_at_utc`           TIMESTAMP               Warehouse update
                                                     timestamp
  --------------------------------------------------------------------------

### 8.4 `workspace.default.gold_fact_charge`

**Grain:** One charge record in one source transaction.

  --------------------------------------------------------------------------
  Column                     Type                    Meaning
  -------------------------- ----------------------- -----------------------
  `source_system`            STRING, not null        Source system

  `source_transaction_id`    STRING, not null        Parent transaction

  `source_charge_id`         STRING, not null        Source charge ID

  `gold_policy_sk`           BIGINT, not null        Gold policy-version
                                                     dimension key

  `policy_number`            STRING, not null        Policy number

  `policy_revision_number`   INT                     Revision

  `effective_date`           DATE                    Effective date

  `charge_type`              STRING                  Charge type

  `charge_description`       STRING                  Charge description

  `coverage_code`            STRING                  Associated coverage, if
                                                     any

  `amount`                   DECIMAL(18,2)           Charge amount

  `taxable`                  BOOLEAN                 Taxable flag

  `created_at_utc`           TIMESTAMP               Warehouse create
                                                     timestamp

  `updated_at_utc`           TIMESTAMP               Warehouse update
                                                     timestamp
  --------------------------------------------------------------------------

### 8.5 `workspace.default.gold_policy_reporting_summary`

**Grain:** Intended one row per Gold policy version, keyed by source
system, policy number, revision, and effective date.

  --------------------------------------------------------------------------
  Column                     Type                    Meaning
  -------------------------- ----------------------- -----------------------
  `source_system`            STRING, not null        Source system

  `policy_number`            STRING, not null        Policy number

  `policy_revision_number`   INT, not null           Revision

  `effective_date`           DATE                    Effective date

  `gold_policy_sk`           BIGINT, not null        Gold dimension key

  `transaction_date`         DATE                    Transaction date

  `transaction_type`         STRING                  Transaction type

  `policy_status`            STRING                  Policy status

  `state`                    STRING                  State

  `insured_name`             STRING                  Display name derived
                                                     from insured/business
                                                     name

  `employee_count`           INT                     Employee count

  `annual_payroll`           DECIMAL(18,2)           Annual payroll

  `coverage_count`           INT                     Number of coverage rows
                                                     at the summary grain

  `written_premium_total`    DECIMAL(18,2)           Sum of coverage written
                                                     premiums

  `annual_premium_total`     DECIMAL(18,2)           Sum of coverage annual
                                                     premiums

  `charges_total`            DECIMAL(18,2)           Sum of charge amounts

  `total_cost_estimate`      DECIMAL(18,2)           POC written premium
                                                     plus charges estimate

  `created_at_utc`           TIMESTAMP               Warehouse create
                                                     timestamp

  `updated_at_utc`           TIMESTAMP               Warehouse update
                                                     timestamp
  --------------------------------------------------------------------------

### Gold transformation rules

1.  Build/merge the Gold dimension using the versioned business key.
2.  Generate `gold_policy_sk` in Gold.
3.  Resolve each fact's `gold_policy_sk` by joining the fact's
    policy-version attributes to `gold_dim_policy_jacket`.
4.  Upsert transaction, coverage, and charge facts with Delta MERGE.
5.  Aggregate coverage premiums separately from charge amounts before
    combining them.
6.  Build the reporting summary at the defined policy-version grain.
7.  Validate that facts have non-null `gold_policy_sk` values and that
    the dimension business key is unique.

**Anti-double-counting rule:** Never join raw coverage rows directly to
raw charge rows and then sum both measures. If a transaction has 3
coverages and 2 charges, a many-to-many join can produce 6 rows,
repeating each premium and each charge. Aggregate coverage amounts to
the intended transaction/policy-version grain first, aggregate charges
separately, and only then join the aggregates.

------------------------------------------------------------------------

## 9. End-to-end column mapping / lineage matrix

This matrix is a business-level lineage guide. Physical Bronze names are
based on the parsing cells discussed; Silver and Gold names reflect the
available DDL. Where a Bronze attribute was not explicitly shown in the
parsing cell, confirm the exact mapping in the live Bronze notebook and
table schema.

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  Business concept        XML source                                      Bronze                               Silver                                                   Gold
  ----------------------- ----------------------------------------------- ------------------------------------ -------------------------------------------------------- -------------------------------------------------------
  Source system           Root `sourceSystem` attribute or notebook       Stored if parsed; confirm exact      `source_system` in all Silver tables                     `source_system` in all Gold tables
                          constant/derivation                             column                                                                                        

  Policy ID               `PolicyHeader/PolicyID`                         `bronze_wc_policy.policy_id`; child  `silver_wc_policy_transaction.source_policy_id`          Usually retained as lineage only if explicitly mapped;
                                                                          rows also carry `policy_id` in the                                                            not the Gold surrogate
                                                                          discussed cells                                                                               

  Policy number           `PolicyHeader/PolicyNumber`                     `policy_number` in policy and child  `silver_wc_policy.policy_number`; used to look up        `gold_dim_policy_jacket.policy_number`; also present in
                                                                          Bronze rows                          `silver_policy_sk`                                       facts/summary

  Policy prefix           `PolicyHeader/PolicyPrefix`                     `policy_prefix`                      `silver_wc_policy.policy_prefix`                         `gold_dim_policy_jacket.policy_prefix`

  Policy revision         `PolicyHeader/PolicyRevisionNumber`             `policy_revision_number`             `silver_wc_policy_transaction.policy_revision_number`;   `gold_dim_policy_jacket.policy_revision_number`;
                                                                                                               jacket latest revision                                   fact/summary revision

  Transaction ID          `PolicyHeader/TransactionID`                    `transaction_id` in policy and child `silver_wc_policy_transaction.source_transaction_id`;    `gold_fact_policy_transaction.source_transaction_id`;
                                                                          Bronze rows                          also child `source_transaction_id`                       coverage/charge fact transaction ID

  Transaction type        `PolicyHeader/TransactionType`                  `transaction_type`                   `silver_wc_policy_transaction.transaction_type`          Gold dimension/fact/summary transaction type as defined

  Transaction status      `PolicyHeader/TransactionStatus`                `transaction_status`                 `silver_wc_policy_transaction.transaction_status`        `gold_dim_policy_jacket.transaction_status`,
                                                                                                                                                                        `gold_fact_policy_transaction.transaction_status`

  Transaction date        `PolicyHeader/TransactionDate`                  `transaction_date`                   `silver_wc_policy_transaction.transaction_date`; jacket  Gold dimension, transaction fact, summary
                                                                                                               latest date                                              

  Effective date          `PolicyHeader/EffectiveDate`                    Parsed by policy parser if included  `silver_wc_policy_transaction.effective_date`            Gold dimension and facts/summary; part of dimension
                                                                                                                                                                        business key

  Expiration date         `PolicyHeader/ExpirationDate`                   Parsed by policy parser if included  `silver_wc_policy_transaction.expiration_date`           Gold dimension and transaction fact

  Policy status           `PolicyHeader/PolicyStatus`                     `policy_status` if parsed            `silver_wc_policy_transaction.policy_status`             Gold dimension/fact/summary

  State                   `PolicyHeader/State`                            `state` in policy and child Bronze   `silver_wc_policy_transaction.state`; jacket             Gold fact `state`; dimension `insured_state`; summary
                                                                          rows                                 `policy_state`/insured state are distinct attributes     `state`

  Currency                `PolicyHeader/Currency`                         Parsed by policy parser if included  Policy jacket and transaction `currency`                 Gold dimension/fact `currency`

  Insured ID              `Insured/InsuredID`                             Policy row if parsed                 `silver_wc_policy.insured_id`                            `gold_dim_policy_jacket.insured_id`

  Insured type            `Insured/InsuredType`                           Policy row if parsed                 `silver_wc_policy.insured_type`                          `gold_dim_policy_jacket.insured_type`

  Insured/business name   `Insured/BusinessName`                          Policy row if parsed                 `silver_wc_policy.business_name`                         `gold_dim_policy_jacket.business_name`; summary
                                                                                                                                                                        `insured_name`

  Masked FEIN             `Insured/FederalEmployerIdentificationNumber`   Policy row if parsed                 `silver_wc_policy.fein_masked`                           Not in current Gold DDL

  Mailing address         `Insured/MailingAddress/*`                      Policy row if parsed                 `street`, `city`, `insured_state`, `postal_code`,        Gold currently includes insured state and postal code,
                                                                                                               `country`                                                not full street/city/country

  Producer ID             `Producer/ProducerID`                           Policy row if parsed                 `silver_wc_policy.producer_id`                           Not in current Gold dimension DDL

  Producer code/name      `Producer/ProducerCode`, `ProducerName`         Policy row if parsed                 `silver_wc_policy.producer_code`, `producer_name`        `gold_dim_policy_jacket.producer_code`, `producer_name`

  Agent ID/name/email     `Agent/*`                                       Policy row if parsed                 `agent_id`, `agent_first_name`, `agent_last_name`,       Gold dimension includes first/last name, not agent
                                                                                                               `agent_email`                                            ID/email

  Product code/name       `Product/ProductCode`, `ProductName`            Policy row if parsed                 `silver_wc_policy.product_code`, `product_name`          `gold_dim_policy_jacket.product_code`, `product_name`

  Industry                `Insured/BusinessDetails/IndustryCode`,         Policy row if parsed                 `silver_wc_policy.industry_code`, `industry_description` Gold dimension
                          `IndustryDescription`                                                                                                                         

  Employee count          Insured business details or risk                Policy row if parsed                 Policy jacket `employee_count`; transaction risk         Gold dimension/fact/summary employee count
                                                                                                               employee count                                           

  Annual payroll          Insured business details or risk                Policy row if parsed                 Policy jacket `annual_payroll`; transaction              Gold dimension/fact/summary annual payroll
                                                                                                               `risk_annual_payroll`                                    

  Risk ID/state           `Risk/RiskID`, `RiskState`                      Policy row if parsed                 `silver_wc_policy_transaction.risk_id`, `risk_state`     Risk ID/state not included in current Gold DDL

  Governing class         Risk governing class fields                     Policy row if parsed                 `silver_wc_policy_transaction.governing_class_code`,     Gold dimension governing class columns
                                                                                                               `governing_class_description`                            

  Coverage code           `Product/Coverages/Coverage/CoverageCode`       `bronze_wc_coverage.coverage_code`   `silver_wc_coverage.coverage_code`                       `gold_fact_coverage.coverage_code`

  Coverage                `CoverageName`, `CoverageDescription`,          Same-named Bronze fields             Same-named Silver fields                                 Same-named Gold coverage fact fields
  name/description/type   `CoverageType`                                                                                                                                

  Coverage class          `Coverage/ClassCode`, `ClassDescription`        `class_code`, `class_description`    Same-named Silver fields                                 Same-named Gold coverage fact fields

  Coverage limit          `Coverage/LimitDescription`                     `limit_description`                  `limit_description`                                      `limit_description`

  Deductible              `Coverage/Deductible`                           `deductible` source text             `deductible DECIMAL(18,2)`                               `deductible DECIMAL(18,2)`

  Written premium         `Coverage/WrittenPremium`                       `written_premium` source text        `written_premium DECIMAL(18,2)`                          `gold_fact_coverage.written_premium`, transaction and
                                                                                                                                                                        summary aggregates

  Annual premium          `Coverage/AnnualPremium`                        `annual_premium` source text         `annual_premium DECIMAL(18,2)`                           `gold_fact_coverage.annual_premium`, transaction and
                                                                                                                                                                        summary aggregates

  Charge ID               `Charges/Charge/ChargeID`                       `charge_id`                          `source_charge_id`                                       `source_charge_id`

  Charge type/description `ChargeType`, `ChargeDescription`               `charge_type`, `charge_description`  Same semantic fields                                     Same semantic fields in Gold charge fact

  Charge coverage         `Charge/CoverageCode`                           `coverage_code`                      `coverage_code`                                          `coverage_code`
  association                                                                                                                                                           

  Charge amount           `Charge/Amount`                                 `amount` source text                 `amount DECIMAL(18,2)`                                   `gold_fact_charge.amount`, transaction/summary charge
                                                                                                                                                                        aggregates

  Taxable flag            `Charge/Taxable`                                `taxable` source text                `taxable BOOLEAN`                                        `gold_fact_charge.taxable`

  Source filename         Filesystem/input metadata                       `source_file_name`                   Source filename retained in transaction/coverage/charge  Dimension/transaction fact source filename; not in
                                                                                                                                                                        coverage/charge Gold DDL

  Source hash             SHA-256 of XML bytes/text                       `file_sha256`                        Retained in Silver transaction/coverage/charge           Dimension/transaction fact source hash

  Ingestion time          Pipeline runtime                                `ingested_at_utc`                    Retained in Silver transaction/coverage/charge           Not present in current Gold fact/dimension schema

  Silver surrogate        Generated by Silver                             None; do not use Bronze policy ID as `silver_policy_sk`                                       Not reused as Gold key
                                                                          substitute                                                                                    

  Gold surrogate          Generated by Gold                               None                                 Not reused from Silver                                   `gold_policy_sk` in dimension and fact/summary
                                                                                                                                                                        references
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

### Key mapping distinction

`policy_id`, `silver_policy_sk`, and `gold_policy_sk` are not
interchangeable:

-   `policy_id`: source-system identifier from XML, useful for lineage.
-   `silver_policy_sk`: warehouse surrogate identifying a Silver policy
    jacket, generated in Silver.
-   `gold_policy_sk`: warehouse surrogate identifying a Gold policy
    version, generated in Gold.

------------------------------------------------------------------------

## 10. Surrogate keys and joins

### Silver policy jacket lookup

Silver child rows resolve the policy jacket using:

``` sql
ON child.source_system = policy.source_system
AND child.policy_number = policy.policy_number
```

The lookup returns `silver_policy_sk`. Do not join on
`policy_id = silver_policy_sk`.

### Gold version lookup

Gold facts resolve the Gold dimension using the versioned business key:

``` sql
ON fact.source_system = dim.source_system
AND fact.policy_number = dim.policy_number
AND fact.policy_revision_number = dim.policy_revision_number
AND fact.effective_date = dim.effective_date
```

The exact MERGE/join SQL should handle null effective dates
deliberately; ordinary equality does not match null to null in SQL.
Prefer a consistent non-null business key or null-safe comparison when
required.

### Why independent keys?

-   Surrogate IDs are implementation-specific warehouse keys.
-   Identity values may be different across layers and may not restart
    at 1 after `TRUNCATE`.
-   A source identifier does not automatically have the same uniqueness,
    lifecycle, or semantics as a warehouse dimension key.
-   Gold's version grain is different from Silver's policy-jacket grain.
    One Silver policy jacket can map to multiple Gold policy versions.

------------------------------------------------------------------------

## 11. Sample data walkthrough

Assume the five files are processed and all tables start empty.

### 11.1 Source transactions

  --------------------------------------------------------------------------
  File          Policy number Type                    Revision Intended
                                                               conceptual
                                                               meaning
  ------------- ------------- -------------- ----------------- -------------
  01            WC-1001       New business                   0 Initial
                                                               transaction
                                                               for policy
                                                               1001

  02            WC-1001       Endorsement                    1 A later
                                                               transaction
                                                               affecting
                                                               policy 1001

  03            WC-1002       New business                   0 Initial
                                                               transaction
                                                               for policy
                                                               1002

  04            WC-1003       New business                   0 Initial
                                                               transaction
                                                               for policy
                                                               1003

  05            WC-1003       Cancellation                   1 A later
                                                               transaction
                                                               affecting
                                                               policy 1003
  --------------------------------------------------------------------------

This is synthetic test data. Transaction dates, effective dates,
statuses, and actual sample XML values should be read from the XML files
themselves.

### 11.2 Row-count arithmetic

For the five dedicated files:

-   XML documents: `5`
-   `<Policy>` transactions: `5 × 1 = 5`
-   `<Coverage>` records: `5 × 3 = 15`
-   `<Charge>` records: `5 × 2 = 10`
-   Unique policy numbers: `WC-1001`, `WC-1002`, `WC-1003` → `3`

Therefore: - Bronze policy = 5; Bronze coverage = 15; Bronze charge =
10; Bronze raw XML = 5. - Silver policy jacket = 3; Silver transaction =
5; Silver coverage = 15; Silver charge = 10. - Gold transaction fact =
5; Gold coverage fact = 15; Gold charge fact = 10; Gold dimension and
summary are up to 5 rows depending on unique policy-version keys.

### 11.3 Why policy counts differ from transaction counts

WC-1001 appears twice and WC-1003 appears twice. The Silver policy
jacket consolidates the identity of each policy number, while the Silver
transaction table preserves the separate events. This is intentional:
policy identity and policy transaction history are different entities.

------------------------------------------------------------------------

## 12. Gold measures and financial semantics

### Coverage measures

-   `written_premium`: written premium associated with an individual
    coverage row.
-   `annual_premium`: annual premium associated with an individual
    coverage row.
-   `written_premium_total`: aggregate of coverage written premiums at
    the transaction/policy-version grain selected by the Gold notebook.
-   `annual_premium_total`: aggregate of coverage annual premiums at the
    same grain.

### Charge measures

-   `amount`: amount for an individual charge row.
-   `charges_total`: sum of charge amounts at the relevant
    transaction/policy-version grain.

### POC total cost estimate

The intended POC formula is:

``` text
total_cost_estimate = written_premium_total + charges_total
```

This is a synthetic reporting metric only. The production definition
would need confirmation from an insurance product/accounting owner. Do
not call it invoice total, amount due, earned premium, premium payable,
or booked accounting cost unless those definitions are independently
approved.

### Avoid double-counting

Do not sum premiums and charges after joining unaggregated coverage and
charge detail tables directly on transaction ID. That creates a fan-out.
Example: 3 coverages × 2 charges = 6 joined rows. The same
premium/charge values may repeat.

Correct approach: 1. Aggregate coverage premium rows by the intended
transaction/version key. 2. Aggregate charges independently by that same
key. 3. Join the two aggregates. 4. Compute `total_cost_estimate`.

### Transaction versus policy-version metrics

Be explicit about the grain of every metric. If a policy has multiple
transactions or versions, summing all transactions may represent
transaction activity over time, not current policy premium. Do not
assume the latest transaction is the current truth unless a
current-state selection rule is defined.

------------------------------------------------------------------------

## 13. How the agent should answer questions and select tables

### Preferred query surface

For common business questions, start with
`workspace.default.gold_policy_reporting_summary`. It is intended as a
compact reporting table.

Use: - `gold_policy_reporting_summary` for policy-version overview,
status, employee count, payroll, coverage count, premium totals,
charges, and total cost estimate. - `gold_dim_policy_jacket` for policy
version attributes, insured, producer, agent, product, industry, and
governing class. - `gold_fact_policy_transaction` for transaction
history and transaction-level premium/charge totals. -
`gold_fact_coverage` for coverage, class, limit, deductible, and
coverage-level premium analysis. - `gold_fact_charge` for charge types,
charge descriptions, coverage association, taxable flags, and charge
amounts. - Silver tables for detailed conformed records and lineage when
Gold does not expose an attribute. - Bronze tables for source-level
debugging, raw XML verification, or parser/lineage investigation.

### Agent table-selection rules

1.  If the question asks "how many policies?", clarify whether it means
    unique policy numbers, policy versions, or transactions. Use Silver
    policy for unique policy jackets, Gold dimension for versions, and
    transaction fact for transactions.
2.  If the question asks "how many transactions?", use
    `gold_fact_policy_transaction` or `silver_wc_policy_transaction`,
    depending on whether the question needs reporting or conformed
    source detail.
3.  If the question asks "premium by coverage/class?", use
    `gold_fact_coverage`.
4.  If the question asks "charges, fees, surcharges, or taxable
    charges?", use `gold_fact_charge`.
5.  If the question asks for a summary across premium and charges, use
    `gold_policy_reporting_summary` or transaction fact, checking the
    metric grain.
6.  If the question asks about a specific XML source value or why it was
    parsed a certain way, inspect Bronze or the XML.
7.  If the question asks for "current policy status," do not blindly
    choose the maximum revision or latest date without understanding the
    defined transaction/current-state rules. A cancellation transaction
    may be a historical event or may indicate a cancelled policy
    depending on the data semantics.
8.  If a question mixes coverage and charges, aggregate each
    independently before joining.
9.  Always qualify tables with `workspace.default` unless the user
    explicitly specifies another catalog/schema.
10. Use actual table columns from live schema introspection when
    possible. Do not hallucinate columns.

### Recommended natural-language response conventions

-   State whether counts refer to policy numbers, versions,
    transactions, coverages, or charges.
-   Explain the grain of a result.
-   Distinguish written premium from annual premium.
-   Describe `total_cost_estimate` as a POC metric, not an authoritative
    amount due.
-   Mention if a result may include multiple revisions/transactions.
-   If a live query returns different counts from expected counts,
    report the live counts and investigate duplicate files, reruns,
    failed parsing, missing XML elements, or different source files.

------------------------------------------------------------------------

## 14. Example SQL patterns for the agent

These are starting patterns. Confirm columns and semantics in live
schema before executing.

### 14.1 Count all layer tables

``` sql
SELECT 'Bronze' AS layer, 'bronze_wc_xml_raw' AS table_name, COUNT(*) AS row_count
FROM workspace.default.bronze_wc_xml_raw
UNION ALL
SELECT 'Bronze', 'bronze_wc_policy', COUNT(*)
FROM workspace.default.bronze_wc_policy
UNION ALL
SELECT 'Bronze', 'bronze_wc_coverage', COUNT(*)
FROM workspace.default.bronze_wc_coverage
UNION ALL
SELECT 'Bronze', 'bronze_wc_charge', COUNT(*)
FROM workspace.default.bronze_wc_charge
UNION ALL
SELECT 'Silver', 'silver_wc_policy', COUNT(*)
FROM workspace.default.silver_wc_policy
UNION ALL
SELECT 'Silver', 'silver_wc_policy_transaction', COUNT(*)
FROM workspace.default.silver_wc_policy_transaction
UNION ALL
SELECT 'Silver', 'silver_wc_coverage', COUNT(*)
FROM workspace.default.silver_wc_coverage
UNION ALL
SELECT 'Silver', 'silver_wc_charge', COUNT(*)
FROM workspace.default.silver_wc_charge
UNION ALL
SELECT 'Gold', 'gold_dim_policy_jacket', COUNT(*)
FROM workspace.default.gold_dim_policy_jacket
UNION ALL
SELECT 'Gold', 'gold_fact_policy_transaction', COUNT(*)
FROM workspace.default.gold_fact_policy_transaction
UNION ALL
SELECT 'Gold', 'gold_fact_coverage', COUNT(*)
FROM workspace.default.gold_fact_coverage
UNION ALL
SELECT 'Gold', 'gold_fact_charge', COUNT(*)
FROM workspace.default.gold_fact_charge
UNION ALL
SELECT 'Gold', 'gold_policy_reporting_summary', COUNT(*)
FROM workspace.default.gold_policy_reporting_summary
ORDER BY layer, table_name;
```

### 14.2 Policy transaction history

``` sql
SELECT
    source_system,
    policy_number,
    policy_revision_number,
    source_transaction_id,
    transaction_type,
    transaction_status,
    transaction_date,
    effective_date,
    expiration_date,
    policy_status
FROM workspace.default.gold_fact_policy_transaction
WHERE policy_number = 'WC-1001'
ORDER BY transaction_date, policy_revision_number;
```

This answers transaction history, not necessarily a business-approved
"current state" calculation.

### 14.3 Coverage premiums by policy and coverage

``` sql
SELECT
    policy_number,
    coverage_code,
    coverage_name,
    SUM(written_premium) AS written_premium_total,
    SUM(annual_premium) AS annual_premium_total
FROM workspace.default.gold_fact_coverage
GROUP BY policy_number, coverage_code, coverage_name
ORDER BY policy_number, coverage_code;
```

This aggregates across all matching transactions/versions. If the
request is specifically for the latest/current version, filter to the
correct version according to the agreed business rule.

### 14.4 Charges by policy and charge type

``` sql
SELECT
    policy_number,
    charge_type,
    SUM(amount) AS charge_amount_total
FROM workspace.default.gold_fact_charge
GROUP BY policy_number, charge_type
ORDER BY policy_number, charge_type;
```

Again, this sums across transactions/versions unless filtered.

### 14.5 Summary query

``` sql
SELECT
    policy_number,
    policy_revision_number,
    effective_date,
    transaction_date,
    transaction_type,
    policy_status,
    state,
    insured_name,
    employee_count,
    annual_payroll,
    coverage_count,
    written_premium_total,
    annual_premium_total,
    charges_total,
    total_cost_estimate
FROM workspace.default.gold_policy_reporting_summary
ORDER BY policy_number, policy_revision_number, effective_date;
```

### 14.6 Check for facts with missing Gold keys

``` sql
SELECT 'gold_fact_policy_transaction' AS table_name,
       COUNT(*) AS total_rows,
       SUM(CASE WHEN gold_policy_sk IS NULL THEN 1 ELSE 0 END) AS null_gold_keys
FROM workspace.default.gold_fact_policy_transaction
UNION ALL
SELECT 'gold_fact_coverage', COUNT(*),
       SUM(CASE WHEN gold_policy_sk IS NULL THEN 1 ELSE 0 END)
FROM workspace.default.gold_fact_coverage
UNION ALL
SELECT 'gold_fact_charge', COUNT(*),
       SUM(CASE WHEN gold_policy_sk IS NULL THEN 1 ELSE 0 END)
FROM workspace.default.gold_fact_charge;
```

Expected null key count: zero. This check does not prove that the key
maps to the correct dimension row; also check for orphan keys and
uniqueness.

### 14.7 Check duplicate dimension business keys

``` sql
SELECT
    source_system,
    policy_number,
    policy_revision_number,
    effective_date,
    COUNT(*) AS row_count
FROM workspace.default.gold_dim_policy_jacket
GROUP BY
    source_system,
    policy_number,
    policy_revision_number,
    effective_date
HAVING COUNT(*) > 1;
```

Expected result: no rows, if the configured version business key is
unique and MERGE logic is correct.

### 14.8 Validate transaction counts by type

``` sql
SELECT transaction_type, COUNT(*) AS transaction_count
FROM workspace.default.gold_fact_policy_transaction
GROUP BY transaction_type
ORDER BY transaction_type;
```

Useful for confirming that new business, endorsement, and cancellation
events were preserved as distinct transactions.

------------------------------------------------------------------------

## 15. Operational workflow and reruns

### Recommended execution order

1.  Confirm that the volume contains the intended XML files only.
2.  Confirm or create Bronze tables.
3.  Run Bronze notebook cells in order: discover/read files, write raw
    XML, parse policy, parse coverage, parse charge.
4.  Verify Bronze row counts and sample records.
5.  Run the Silver notebook in order.
6.  Verify Silver counts, data types, policy key lookups, and
    transaction/child relationships.
7.  Run the Gold notebook in order.
8.  Verify Gold counts, dimension business-key uniqueness,
    fact-to-dimension key lookups, summary metrics, and premium/charge
    totals.
9.  Use Gold tables for the AI SQL assistant's default reporting
    queries.

### Truncation for a clean test reload

The following script was used as a clean-reload pattern:

``` sql
TRUNCATE TABLE workspace.default.bronze_wc_xml_raw;
TRUNCATE TABLE workspace.default.bronze_wc_policy;
TRUNCATE TABLE workspace.default.bronze_wc_coverage;
TRUNCATE TABLE workspace.default.bronze_wc_charge;

TRUNCATE TABLE workspace.default.silver_wc_policy;
TRUNCATE TABLE workspace.default.silver_wc_policy_transaction;
TRUNCATE TABLE workspace.default.silver_wc_coverage;
TRUNCATE TABLE workspace.default.silver_wc_charge;

TRUNCATE TABLE workspace.default.gold_dim_policy_jacket;
TRUNCATE TABLE workspace.default.gold_fact_policy_transaction;
TRUNCATE TABLE workspace.default.gold_fact_coverage;
TRUNCATE TABLE workspace.default.gold_fact_charge;
TRUNCATE TABLE workspace.default.gold_policy_reporting_summary;
```

Use only in a development/test environment when a full reload is
intended. Truncating Delta identity tables may not reset identity
counters; key values are not required to restart at 1. Confirm
downstream table dependencies and table permissions before running.

### Append versus MERGE

-   Bronze uses append in the discussed notebook cells. Re-running
    Bronze without clearing or deduplicating can create duplicate
    raw/policy/coverage/charge rows.
-   Silver uses Delta MERGE upserts, intended to make matching business
    records update rather than duplicate.
-   Gold uses MERGE upserts for facts and dimension logic, but
    correctness depends on unique source staging and the configured
    business keys.
-   MERGE does not automatically solve duplicate source keys: multiple
    source rows matching one target row can cause errors or
    nondeterministic results. Deduplicate source data before MERGE where
    needed.

### Common ingestion issues encountered

The Bronze notebook was patched during development. Important lessons
for future maintenance:

-   Do not mix `xml_files` (a list of file-path strings in one cell) and
    `xml_documents` (a list of dictionaries) without converting
    consistently.
-   Parsing cells expecting `item["root"]` cannot work if the loop item
    is a string.
-   The consistent representation used in the corrected Cells 5 and 6 is
    `xml_documents`, with each item containing `file_name` and
    `xml_text`; each cell parses `root = ET.fromstring(xml_payload)`.
-   Shared helper functions such as `txt`, `raw_xml`, and
    `create_bronze_df` must be defined before parsing cells execute.
-   Python file reads should use `/Volumes/...` paths rather than
    passing `dbfs:/Volumes/...` to `open()`.
-   XML namespace differences can cause `findall("Policy")` to return
    zero results.
-   Check that DataFrame columns/types match existing Delta table schema
    before append.
-   Avoid rerunning successful append cells unless tables are cleared or
    the load is designed to be idempotent.

------------------------------------------------------------------------

## 16. Data quality and reconciliation checks

The agent or pipeline operator should consider the following
validations.

### File and parsing validation

-   Count discovered files and compare with expected source files.
-   Record files that fail XML parsing.
-   Confirm each intended file contains exactly one `<Policy>`
    transaction.
-   Compare the number of `<Coverage>` and `<Charge>` elements in XML
    with the corresponding Bronze extracted rows.
-   Verify `file_sha256` and `source_file_name` are populated.
-   Ensure source-system value is present and consistent.

### Business key validation

-   Silver policy: uniqueness of `(source_system, policy_number)`.
-   Silver transaction: uniqueness of
    `(source_system, source_transaction_id)`.
-   Gold dimension: uniqueness of
    `(source_system, policy_number, policy_revision_number, effective_date)`.
-   Gold transaction fact: uniqueness of
    `(source_system, source_transaction_id)`.
-   Child fact uniqueness should be based on the actual business key,
    such as transaction plus coverage identifier or transaction plus
    charge ID. The current Silver coverage DDL does not expose a
    separate coverage-row ID, so determine whether
    `(source_system, source_transaction_id, coverage_code)` is unique
    before using it as the merge key.

### Relationship validation

-   Every Silver transaction should find a Silver policy jacket.
-   Every Silver coverage/charge should find the expected Silver policy
    jacket and transaction.
-   Every Gold fact should resolve to exactly one Gold dimension row.
-   No Gold fact should have a null or orphan `gold_policy_sk`.
-   Dimension lookups should not multiply rows. If a join increases fact
    row counts, inspect duplicate dimension business keys.

### Numeric validation

-   Check whether deductible, premiums, payroll, employee counts, charge
    amount, and taxable flags parsed correctly.
-   Identify null or malformed values caused by invalid source strings.
-   Reconcile Gold coverage premium totals to Silver coverage sums at
    the same grain.
-   Reconcile Gold charge totals to Silver charge sums at the same
    grain.
-   Validate
    `total_cost_estimate = written_premium_total + charges_total` within
    the same grain.
-   Do not compare totals across different grains without explicitly
    explaining the aggregation.

### State/history validation

-   Confirm new-business, endorsement, and cancellation transactions are
    preserved.
-   Confirm policy revisions and effective dates are mapped correctly.
-   Do not infer that cancellation automatically means a current policy
    is cancelled unless the source status and agreed business rules
    support that interpretation.

------------------------------------------------------------------------

## 17. Known limitations and decisions that require business confirmation

This is a POC. Before production use, validate the following:

1.  **Authoritative schema:** Verify live table schemas, exact Bronze
    columns, and all notebook code versions.
2.  **Source-system semantics:** Confirm how `source_system` is derived
    and whether multiple systems can supply the same policy number.
3.  **Policy version grain:** Confirm that
    `(source_system, policy_number, policy_revision_number, effective_date)`
    is the correct Gold dimension key.
4.  **Null effective dates:** Define behavior in dimension MERGE and
    joins.
5.  **Transaction identity:** Confirm source transaction IDs are unique
    within source system.
6.  **Coverage identity:** Confirm the appropriate coverage business
    key, especially if duplicate coverage codes can occur in one
    transaction.
7.  **Charge identity:** Confirm charge IDs are unique within
    transaction/source system.
8.  **Current policy logic:** Define how to determine latest/current
    policy status, especially for cancellation, reinstatement,
    correction, and backdated transactions.
9.  **Financial definitions:** Confirm written premium, annual premium,
    charge inclusion, and the intended definition of total cost.
10. **Currency:** Define handling if multiple currencies are present.
11. **Time zones:** Define whether source timestamps are local,
    offset-aware, or normalized to UTC.
12. **Late/corrected data:** Define how revised files, duplicate files,
    and out-of-order transactions are handled.
13. **Security/privacy:** Use masked or synthetic insured data for this
    POC; do not expose sensitive customer information in agent answers.
14. **Production lineage:** Consider adding run ID, ingestion status,
    reject/error tables, source schema version, and processing
    timestamps.
15. **Idempotency:** Bronze should eventually have a clear file-level
    deduplication/reprocessing strategy rather than relying on manual
    truncation.

------------------------------------------------------------------------

## 18. Glossary

  -----------------------------------------------------------------------
  Term                                Meaning in this POC
  ----------------------------------- -----------------------------------
  Policy                              Insurance contract identified by a
                                      policy number

  Policy jacket                       Consolidated Silver record
                                      representing a policy number

  Policy transaction                  A business event for a policy, such
                                      as new business, endorsement, or
                                      cancellation

  Policy revision                     Version/revision identifier
                                      associated with policy changes

  Effective date                      Date a policy/version takes effect

  Coverage                            A coverage-level component of the
                                      policy, with class, limits,
                                      deductible and premium information

  Charge                              A fee/surcharge amount associated
                                      with a policy transaction,
                                      optionally tied to a coverage

  Premium                             Amount associated with insurance
                                      coverage; written and annual
                                      premium are distinct measures

  Source/business key                 Identifiers supplied by the source
                                      or defined by business semantics

  Surrogate key                       Warehouse-generated key such as
                                      `silver_policy_sk` or
                                      `gold_policy_sk`

  Grain                               What one row in a table represents

  Bronze                              Raw/landing and source-extraction
                                      layer

  Silver                              Cleaned, typed, conformed
                                      business-data layer

  Gold                                Reporting-oriented
                                      dimension/fact/summary layer

  Dimension                           Descriptive entity table used to
                                      contextualize facts

  Fact                                Table containing events,
                                      measurements, or detail rows for
                                      analysis

  MERGE/upsert                        Operation that updates matching
                                      target rows and inserts new ones

  Idempotent processing               Re-running the same input does not
                                      change the logical result or create
                                      duplicates

  Fan-out                             Row multiplication caused by
                                      joining tables with multiple rows
                                      on both sides

  Data lineage                        Information showing where a value
                                      originated and how it was
                                      transformed
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 19. Agent instructions / system knowledge checklist

When using this document as agent metadata, the agent should follow
these rules:

1.  Prefer Gold for reporting questions; use Silver for conformed detail
    and Bronze for source investigation.
2.  Always state the table grain and clarify ambiguity between policy,
    policy version, transaction, coverage, and charge.
3.  Do not treat `policy_id`, `silver_policy_sk`, and `gold_policy_sk`
    as equivalent.
4.  Use `(source_system, policy_number)` for the Silver policy jacket
    lookup.
5.  Use
    `(source_system, policy_number, policy_revision_number, effective_date)`
    for the Gold policy-version dimension lookup, with explicit null
    handling.
6.  Use transaction IDs to preserve and query event history.
7.  Aggregate coverage and charge data separately before joining them.
8.  Keep written premium, annual premium, charge totals, and POC
    total-cost estimate distinct.
9.  Do not present the POC total-cost estimate as an authoritative
    premium, invoice, or amount due.
10. Treat row counts in this file as expected test counts, not
    guaranteed current counts.
11. Prefer live schema inspection and live query results over stale
    documentation if they disagree.
12. Do not invent columns, source values, policies, or business rules
    that are not present in the tables or XML.
13. Explain whether a result spans all policy revisions/transactions or
    is filtered to one version.
14. If data is missing, keys are unresolved, counts are unexpectedly
    high, or parsing returns zero rows, describe the uncertainty and
    recommend validation rather than fabricating a result.
15. Remember that all current data and business logic are synthetic POC
    content, not verified Progressive production definitions.

------------------------------------------------------------------------

## 20. Quick reference

### Tables

**Bronze** - `workspace.default.bronze_wc_xml_raw` -
`workspace.default.bronze_wc_policy` -
`workspace.default.bronze_wc_coverage` -
`workspace.default.bronze_wc_charge`

**Silver** - `workspace.default.silver_wc_policy` -
`workspace.default.silver_wc_policy_transaction` -
`workspace.default.silver_wc_coverage` -
`workspace.default.silver_wc_charge`

**Gold** - `workspace.default.gold_dim_policy_jacket` -
`workspace.default.gold_fact_policy_transaction` -
`workspace.default.gold_fact_coverage` -
`workspace.default.gold_fact_charge` -
`workspace.default.gold_policy_reporting_summary`

### Key business identifiers

-   Source policy ID: `policy_id` / `source_policy_id`
-   Policy number: `policy_number`
-   Source transaction ID: Bronze `transaction_id`, Silver/Gold
    `source_transaction_id`
-   Silver policy surrogate: `silver_policy_sk`
-   Gold policy-version surrogate: `gold_policy_sk`
-   Gold dimension business key:
    `(source_system, policy_number, policy_revision_number, effective_date)`

### Expected counts for five dedicated files

-   Bronze: raw 5, policy 5, coverage 15, charge 10.
-   Silver: policy 3, transaction 5, coverage 15, charge 10.
-   Gold: policy-version dimension up to 5, transaction fact 5, coverage
    fact 15, charge fact 10, summary up to 5.

### One-sentence explanation

**The pipeline turns XML policy transactions into traceable Bronze
records, standardized Silver policy/transaction/coverage/charge
entities, and Gold policy-version facts and summaries that the agent can
query without confusing policy identity, transaction history, coverage
premiums, and charges.**
