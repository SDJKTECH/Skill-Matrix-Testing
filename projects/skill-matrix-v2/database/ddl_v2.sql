-- DROP SCHEMA skill_matrix_v2_prod;

CREATE SCHEMA skill_matrix_v2_prod AUTHORIZATION cloudsqlsuperuser;

-- DROP TYPE skill_matrix_v2_prod."approval_status_enum";

CREATE TYPE skill_matrix_v2_prod."approval_status_enum" AS ENUM (
	'Pending',
	'Approved',
	'Rejected',
	'Pre-Approved');

-- DROP TYPE skill_matrix_v2_prod."comment_type_enum";

CREATE TYPE skill_matrix_v2_prod."comment_type_enum" AS ENUM (
	'Employee',
	'Manager',
	'Department');

-- DROP TYPE skill_matrix_v2_prod."employee_type_enum";

CREATE TYPE skill_matrix_v2_prod."employee_type_enum" AS ENUM (
	'New Lateral',
	'Existing Lateral',
	'Freshers',
	'Customer',
	'Interns');

-- DROP TYPE skill_matrix_v2_prod."role_enum";

CREATE TYPE skill_matrix_v2_prod."role_enum" AS ENUM (
	'Admin',
	'Dept',
	'HR',
	'Manager',
	'User');

-- DROP TYPE skill_matrix_v2_prod."skill_level_enum";

CREATE TYPE skill_matrix_v2_prod."skill_level_enum" AS ENUM (
	'L1',
	'L2',
	'L3');


-- DROP TYPE skill_matrix_v2_prod."training_batch_status_enum";

CREATE TYPE skill_matrix_v2_prod."training_batch_status_enum" AS ENUM (
	'Planned',
	'Open',
	'In Progress',
	'Completed',
	'Cancelled',
	'Archived');

-- DROP TYPE skill_matrix_v2_prod."training_mode_enum";

CREATE TYPE skill_matrix_v2_prod."training_mode_enum" AS ENUM (
	'Internal Videos',
	'External Platforms',
	'Hybrid',
	'Internal Instructor-led',
	'External Instructor-led');

-- DROP TYPE skill_matrix_v2_prod."training_status_enum";

CREATE TYPE skill_matrix_v2_prod."training_status_enum" AS ENUM (
	'Not Started',
	'In Progress',
	'Completed',
	'Not Completed',
	'Pending Approval');

-- DROP SEQUENCE skill_matrix_v2_prod.certificate_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.certificate_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.certification_provider_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.certification_provider_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.comment_comment_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.comment_comment_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.employee_certificates_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.employee_certificates_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.employee_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.employee_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.employee_skills_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.employee_skills_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.employee_trainings_employee_training_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.employee_trainings_employee_training_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.master_area_area_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.master_area_area_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.master_discipline_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.master_discipline_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.master_domain_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.master_domain_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.master_framework_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.master_framework_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.master_module_module_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.master_module_module_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.master_skill_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.master_skill_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.master_subarea_sub_area_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.master_subarea_sub_area_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.provider_certificate_mapping_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.provider_certificate_mapping_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.skill_hierarchy_links_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.skill_hierarchy_links_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE skill_matrix_v2_prod.training_hierarchy_links_training_hierarchy_id_seq;

CREATE SEQUENCE skill_matrix_v2_prod.training_hierarchy_links_training_hierarchy_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;-- skill_matrix_v2_prod.master_area definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.master_area;

CREATE TABLE skill_matrix_v2_prod.master_area ( area_id serial4 NOT NULL, area_name varchar(255) NOT NULL, description text NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT master_area_pkey PRIMARY KEY (area_id));

-- Table Triggers

create trigger update_masterarea_updated_at before
update
    on
    skill_matrix_v2_prod.master_area for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.master_certificate definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.master_certificate;

CREATE TABLE skill_matrix_v2_prod.master_certificate ( id int4 DEFAULT nextval('skill_matrix_v2_prod.certificate_id_seq'::regclass) NOT NULL, cert_name varchar(500) NOT NULL, cert_level varchar(100) NOT NULL, valid_years varchar DEFAULT '0' NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT master_certificate_cert_name_cert_level_key UNIQUE (cert_name, cert_level), CONSTRAINT master_certificate_pkey PRIMARY KEY (id));

-- Table Triggers

create trigger update_mastercertificate_updated_at before
update
    on
    skill_matrix_v2_prod.master_certificate for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.master_certificate_provider definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.master_certificate_provider;

CREATE TABLE skill_matrix_v2_prod.master_certificate_provider ( id int4 DEFAULT nextval('skill_matrix_v2_prod.certification_provider_id_seq'::regclass) NOT NULL, cert_provider varchar(255) NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT master_certificate_provider_cert_provider_key UNIQUE (cert_provider), CONSTRAINT master_certificate_provider_pkey PRIMARY KEY (id));

-- Table Triggers

create trigger update_mastercertificateprovider_updated_at before
update
    on
    skill_matrix_v2_prod.master_certificate_provider for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.master_discipline definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.master_discipline;

CREATE TABLE skill_matrix_v2_prod.master_discipline ( id serial4 NOT NULL, discipline_name varchar(255) NOT NULL, description text NULL, is_mandatory bool DEFAULT false NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, ismandatory bool NULL, CONSTRAINT master_discipline_pkey PRIMARY KEY (id));

-- Table Triggers

create trigger update_masterdiscipline_updated_at before
update
    on
    skill_matrix_v2_prod.master_discipline for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.master_domain definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.master_domain;

CREATE TABLE skill_matrix_v2_prod.master_domain ( id serial4 NOT NULL, domain_name varchar(255) NOT NULL, description text NULL, is_mandatory bool DEFAULT false NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT master_domain_pkey PRIMARY KEY (id));

-- Table Triggers

create trigger update_masterdomain_updated_at before
update
    on
    skill_matrix_v2_prod.master_domain for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.master_framework definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.master_framework;

CREATE TABLE skill_matrix_v2_prod.master_framework ( id serial4 NOT NULL, framework_name varchar(255) NOT NULL, basic text NULL, intermediate text NULL, expert text NULL, description text NULL, is_mandatory bool DEFAULT false NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, ismandatory bool NULL, CONSTRAINT master_framework_pkey PRIMARY KEY (id));

-- Table Triggers

create trigger update_masterframework_updated_at before
update
    on
    skill_matrix_v2_prod.master_framework for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.master_module definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.master_module;

CREATE TABLE skill_matrix_v2_prod.master_module ( module_id serial4 NOT NULL, module_name varchar(255) NOT NULL, course_level text NULL, description text NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT master_module_pkey PRIMARY KEY (module_id));

-- Table Triggers

create trigger update_mastermodule_updated_at before
update
    on
    skill_matrix_v2_prod.master_module for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.master_skill_area definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.master_skill_area;

CREATE TABLE skill_matrix_v2_prod.master_skill_area ( id int4 DEFAULT nextval('skill_matrix_v2_prod.master_skill_id_seq'::regclass) NOT NULL, skill_area varchar(255) NOT NULL, description text NULL, is_mandatory bool DEFAULT false NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, ismandatory bool NULL, CONSTRAINT master_skill_area_pkey PRIMARY KEY (id));

-- Table Triggers

create trigger update_masterskillarea_updated_at before
update
    on
    skill_matrix_v2_prod.master_skill_area for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.master_subarea definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.master_subarea;

CREATE TABLE skill_matrix_v2_prod.master_subarea ( sub_area_id serial4 NOT NULL, sub_area_name varchar(255) NOT NULL, description text NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT master_subarea_pkey PRIMARY KEY (sub_area_id));

-- Table Triggers

create trigger update_mastersubarea_updated_at before
update
    on
    skill_matrix_v2_prod.master_subarea for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.sql_agent_session definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.sql_agent_session;

CREATE TABLE skill_matrix_v2_prod.sql_agent_session ( session_id uuid DEFAULT gen_random_uuid() NOT NULL, last_question text NOT NULL, last_sql text NOT NULL, schema_name text NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT sql_agent_session_pkey PRIMARY KEY (session_id));


-- skill_matrix_v2_prod.employee definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.employee;

CREATE TABLE skill_matrix_v2_prod.employee ( id serial4 NOT NULL, email varchar(255) NOT NULL, department varchar(255) NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, emp_id varchar(50) NULL, "name" varchar(255) NULL, job_title varchar(255) NULL, reports_to int4 NULL, cv_public_url text NULL, "role" skill_matrix_v2_prod."role_enum" NULL, is_manager bool DEFAULT false NOT NULL, CONSTRAINT employee_email_key UNIQUE (email), CONSTRAINT employee_pkey PRIMARY KEY (id), CONSTRAINT employee_reports_to_fkey FOREIGN KEY (reports_to) REFERENCES skill_matrix_v2_prod.employee(id) ON DELETE SET NULL ON UPDATE CASCADE);
CREATE INDEX idx_employee_reports_to ON skill_matrix_v2_prod.employee USING btree (reports_to);

-- Table Triggers

create trigger update_employee_updated_at before
update
    on
    skill_matrix_v2_prod.employee for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.provider_certificate_mapping definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.provider_certificate_mapping;

CREATE TABLE skill_matrix_v2_prod.provider_certificate_mapping ( id serial4 NOT NULL, provider_id int4 NOT NULL, certificate_id int4 NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT provider_certificate_mapping_pkey PRIMARY KEY (id), CONSTRAINT provider_certificate_mapping_provider_id_certificate_id_key UNIQUE (provider_id, certificate_id), CONSTRAINT provider_certificate_mapping_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES skill_matrix_v2_prod.master_certificate(id) ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT provider_certificate_mapping_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES skill_matrix_v2_prod.master_certificate_provider(id) ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX idx_mapping_certificate ON skill_matrix_v2_prod.provider_certificate_mapping USING btree (certificate_id);
CREATE INDEX idx_mapping_provider ON skill_matrix_v2_prod.provider_certificate_mapping USING btree (provider_id);

-- Table Triggers

create trigger update_providercertificatemapping_updated_at before
update
    on
    skill_matrix_v2_prod.provider_certificate_mapping for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.skill_hierarchy_links definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.skill_hierarchy_links;

CREATE TABLE skill_matrix_v2_prod.skill_hierarchy_links ( id serial4 NOT NULL, domain_id int4 NOT NULL, discipline_id int4 NOT NULL, skill_area_id int4 NOT NULL, framework_id int4 NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, skillarea_id int4 NULL, CONSTRAINT skill_hierarchy_link_domain_discipline_skill_area_framework_key UNIQUE (domain_id, discipline_id, skill_area_id, framework_id), CONSTRAINT skill_hierarchy_link_pkey PRIMARY KEY (id), CONSTRAINT skill_hierarchy_link_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES skill_matrix_v2_prod.master_discipline(id) ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT skill_hierarchy_link_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES skill_matrix_v2_prod.master_domain(id) ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT skill_hierarchy_link_framework_id_fkey FOREIGN KEY (framework_id) REFERENCES skill_matrix_v2_prod.master_framework(id) ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT skill_hierarchy_link_skill_area_id_fkey FOREIGN KEY (skill_area_id) REFERENCES skill_matrix_v2_prod.master_skill_area(id) ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX idx_skillhierarchylink_discipline_id ON skill_matrix_v2_prod.skill_hierarchy_links USING btree (discipline_id);
CREATE INDEX idx_skillhierarchylink_domain_id ON skill_matrix_v2_prod.skill_hierarchy_links USING btree (domain_id);
CREATE INDEX idx_skillhierarchylink_framework_id ON skill_matrix_v2_prod.skill_hierarchy_links USING btree (framework_id);
CREATE INDEX idx_skillhierarchylink_skill_area_id ON skill_matrix_v2_prod.skill_hierarchy_links USING btree (skill_area_id);

-- Table Triggers

create trigger update_skillhierarchylink_updated_at before
update
    on
    skill_matrix_v2_prod.skill_hierarchy_links for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.training_hierarchy_links definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.training_hierarchy_links;

CREATE TABLE skill_matrix_v2_prod.training_hierarchy_links ( training_hierarchy_id serial4 NOT NULL, area_id int4 NOT NULL, sub_area_id int4 NOT NULL, module_id int4 NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT training_hierarchy_links_area_subarea_module_key UNIQUE (area_id, sub_area_id, module_id), CONSTRAINT training_hierarchy_links_pkey PRIMARY KEY (training_hierarchy_id), CONSTRAINT training_hierarchy_links_area_id_fkey FOREIGN KEY (area_id) REFERENCES skill_matrix_v2_prod.master_area(area_id) ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT training_hierarchy_links_module_id_fkey FOREIGN KEY (module_id) REFERENCES skill_matrix_v2_prod.master_module(module_id) ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT training_hierarchy_links_sub_area_id_fkey FOREIGN KEY (sub_area_id) REFERENCES skill_matrix_v2_prod.master_subarea(sub_area_id) ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX idx_traininghierarchylinks_area_id ON skill_matrix_v2_prod.training_hierarchy_links USING btree (area_id);
CREATE INDEX idx_traininghierarchylinks_module_id ON skill_matrix_v2_prod.training_hierarchy_links USING btree (module_id);
CREATE INDEX idx_traininghierarchylinks_sub_area_id ON skill_matrix_v2_prod.training_hierarchy_links USING btree (sub_area_id);

-- Table Triggers

create trigger update_traininghierarchylinks_updated_at before
update
    on
    skill_matrix_v2_prod.training_hierarchy_links for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.employee_certificates definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.employee_certificates;

CREATE TABLE skill_matrix_v2_prod.employee_certificates ( id serial4 NOT NULL, employee_id int4 NOT NULL, certificate_id int4 NOT NULL, issued_date timestamp NULL, expiry_date timestamp NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT employee_certificates_pkey PRIMARY KEY (id), CONSTRAINT employee_certificates_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES skill_matrix_v2_prod.provider_certificate_mapping(id) ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT employee_certificates_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES skill_matrix_v2_prod.employee(id) ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX idx_employeecertificates_certificate_id ON skill_matrix_v2_prod.employee_certificates USING btree (certificate_id);
CREATE INDEX idx_employeecertificates_employee_id ON skill_matrix_v2_prod.employee_certificates USING btree (employee_id);
CREATE INDEX idx_employeecertificates_expiry_date ON skill_matrix_v2_prod.employee_certificates USING btree (expiry_date);

-- Table Triggers

create trigger update_employeecertificates_updated_at before
update
    on
    skill_matrix_v2_prod.employee_certificates for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.employee_skills definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.employee_skills;

CREATE TABLE skill_matrix_v2_prod.employee_skills ( id serial4 NOT NULL, employee_id int4 NOT NULL, skill_hierarchy_id int4 NOT NULL, level_selected skill_matrix_v2_prod."skill_level_enum" NULL, approval_status skill_matrix_v2_prod."approval_status_enum" NULL, rejection_reason text NULL, requested_at timestamp NULL, reviewed_at timestamp NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, reviewed_by int4 NULL, CONSTRAINT employee_skills_pkey PRIMARY KEY (id), CONSTRAINT employee_skills_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES skill_matrix_v2_prod.employee(id) ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT employee_skills_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES skill_matrix_v2_prod.employee(id) ON DELETE SET NULL ON UPDATE CASCADE, CONSTRAINT employee_skills_skill_hierarchy_id_fkey FOREIGN KEY (skill_hierarchy_id) REFERENCES skill_matrix_v2_prod.skill_hierarchy_links(id) ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX idx_employeeskills_approval_status ON skill_matrix_v2_prod.employee_skills USING btree (approval_status);
CREATE INDEX idx_employeeskills_employee_id ON skill_matrix_v2_prod.employee_skills USING btree (employee_id);
CREATE INDEX idx_employeeskills_level_selected ON skill_matrix_v2_prod.employee_skills USING btree (level_selected);
CREATE INDEX idx_employeeskills_reviewed_by ON skill_matrix_v2_prod.employee_skills USING btree (reviewed_by);
CREATE INDEX idx_employeeskills_skill_hierarchy_id ON skill_matrix_v2_prod.employee_skills USING btree (skill_hierarchy_id);

-- Table Triggers

create trigger update_employeeskills_updated_at before
update
    on
    skill_matrix_v2_prod.employee_skills for each row execute function skill_matrix_v2_prod.update_updated_at_column();



-- skill_matrix_v2_prod.training_batches definition

-- Drop table

-- DROP TABLE training_batches;

CREATE TABLE skill_matrix_v2_prod.training_batches ( id serial4 NOT NULL, batch_num varchar(255) NOT NULL, training_hierarchy_id int4 NOT NULL, batch_desc text NULL, training_quarter text NULL, batch_status skill_matrix_v2_prod."training_batch_status_enum" DEFAULT 'Planned'::skill_matrix_v2_prod.training_batch_status_enum NULL, batch_status_remarks text NULL, start_date date NULL, end_date date NULL, duration text NULL, training_mode skill_matrix_v2_prod."training_mode_enum" NULL, trainer text NULL, batch_size int4 NULL, prerequisite text NULL, training_content text NULL, resources text NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT training_batches_batch_size_check CHECK (((batch_size IS NULL) OR (batch_size > 0))), CONSTRAINT training_batches_dates_check CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))), CONSTRAINT training_batches_pkey PRIMARY KEY (id), CONSTRAINT training_batches_unique UNIQUE (batch_num), CONSTRAINT training_batches_training_hierarchy_fkey FOREIGN KEY (training_hierarchy_id) REFERENCES training_hierarchy_links(training_hierarchy_id) ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX training_batches_batch_num_idx ON skill_matrix_v2_prod.training_batches USING btree (batch_num);
CREATE INDEX training_batches_batch_status_idx ON skill_matrix_v2_prod.training_batches USING btree (batch_status);
CREATE INDEX training_batches_training_hierarchy_idx ON skill_matrix_v2_prod.training_batches USING btree (training_hierarchy_id);

-- Table Triggers

create trigger update_trainingbatches_updated_at before
update
    on
    skill_matrix_v2_prod.training_batches for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.employee_trainings definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod.employee_trainings;

CREATE TABLE skill_matrix_v2_prod.employee_trainings ( employee_training_id serial4 NOT NULL, employee_id int4 NOT NULL, batch_id int4 NOT NULL, competency text NULL, training_status skill_matrix_v2_prod."training_status_enum" NULL, status_remarks text NULL, employee_type skill_matrix_v2_prod."employee_type_enum" NULL, nominated_by text NULL, start_date date NULL, end_date date NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT employee_trainings_pkey PRIMARY KEY (employee_training_id), CONSTRAINT uq_employee_batch UNIQUE (employee_id, batch_id), CONSTRAINT employee_trainings_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES training_batches(id) ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT employee_trainings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX idx_employeetrainings_employee_id ON skill_matrix_v2_prod.employee_trainings USING btree (employee_id);
CREATE INDEX idx_employeetrainings_training_batch_id ON skill_matrix_v2_prod.employee_trainings USING btree (batch_id);
CREATE INDEX idx_employeetrainings_training_status ON skill_matrix_v2_prod.employee_trainings USING btree (training_status);
-- Table Triggers

create trigger update_employeetrainings_updated_at before
update
    on
    skill_matrix_v2_prod.employee_trainings for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod."comment" definition

-- Drop table

-- DROP TABLE skill_matrix_v2_prod."comment";

CREATE TABLE skill_matrix_v2_prod."comment" ( comment_id serial4 NOT NULL, employee_training_id int4 NULL, employee_certificate_id int4 NULL, employee_skill_id int4 NULL, comment_type skill_matrix_v2_prod."comment_type_enum" NULL, comment_text text NULL, commented_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, commented_by_id int4 NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, batch_id int4 NULL, CONSTRAINT comment_pkey PRIMARY KEY (comment_id), CONSTRAINT comment_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES skill_matrix_v2_prod.training_batches(id) ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT comment_commented_by_id_fkey FOREIGN KEY (commented_by_id) REFERENCES skill_matrix_v2_prod.employee(id) ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT comment_employee_certificate_id_fkey FOREIGN KEY (employee_certificate_id) REFERENCES skill_matrix_v2_prod.employee_certificates(id) ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT comment_employee_skill_id_fkey FOREIGN KEY (employee_skill_id) REFERENCES skill_matrix_v2_prod.employee_skills(id) ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT comment_employee_training_id_fkey FOREIGN KEY (employee_training_id) REFERENCES skill_matrix_v2_prod.employee_trainings(employee_training_id) ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX idx_comment_commented_by_id ON skill_matrix_v2_prod.comment USING btree (commented_by_id);
CREATE INDEX idx_comment_employee_certificate_id ON skill_matrix_v2_prod.comment USING btree (employee_certificate_id);
CREATE INDEX idx_comment_employee_skill_id ON skill_matrix_v2_prod.comment USING btree (employee_skill_id);
CREATE INDEX idx_comment_employee_training_id ON skill_matrix_v2_prod.comment USING btree (employee_training_id);
CREATE INDEX comment_batch_id_idx ON skill_matrix_v2_prod.comment USING btree (batch_id);

-- Table Triggers

create trigger update_comment_updated_at before
update
    on
    skill_matrix_v2_prod.comment for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.event_subscriptions_config definition
-- Configuration table mapping internal events to GCP Pub/Sub webhook pushes.
-- Queried by backend/utils/event_publisher.py and backend/webhook_consumer_v2/main.py.

CREATE TABLE skill_matrix_v2_prod.event_subscriptions_config ( id serial4 NOT NULL, event_action varchar(100) NOT NULL, target_url varchar(2048) NOT NULL, http_method varchar(20) DEFAULT 'POST'::character varying NULL, headers jsonb NULL, params jsonb NULL, pubsub_topic varchar(255) NOT NULL, pubsub_subscription varchar(255) NOT NULL, is_active bool DEFAULT true NULL, created_by int4 NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL, CONSTRAINT event_subscriptions_config_event_action_target_url_key UNIQUE (event_action, target_url), CONSTRAINT event_subscriptions_config_pkey PRIMARY KEY (id));

-- Table Triggers

create trigger update_eventsubscriptionsconfig_updated_at before
update
    on
    skill_matrix_v2_prod.event_subscriptions_config for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.employee_certificates_with_status source

CREATE OR REPLACE VIEW skill_matrix_v2_prod.employee_certificates_with_status
AS SELECT id,
    employee_id,
    certificate_id,
    issued_date,
    expiry_date,
        CASE
            WHEN expiry_date IS NULL THEN true
            WHEN expiry_date >= CURRENT_TIMESTAMP THEN true
            ELSE false
        END AS is_active,
    created_at,
    updated_at
   FROM skill_matrix_v2_prod.employee_certificates;



-- DROP FUNCTION skill_matrix_v2_prod.update_expired_certificates();

CREATE OR REPLACE FUNCTION skill_matrix_v2_prod.update_expired_certificates()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    updated_count integer;
BEGIN
    -- This function can be called by a scheduled job (pg_cron) to update expired certificates
    -- For automatic daily updates, you would need to set up pg_cron extension:
    -- SELECT cron.schedule('update-expired-certs', '0 0 * * *', 'SELECT skill_matrix_v2_prod.update_expired_certificates();');
    
    -- Note: Since we're using a view with computed is_active, this function is optional
    -- If you prefer storing is_active in the table, uncomment the UPDATE statement below
    -- and set up a scheduled job to call this function daily
    
    -- UPDATE skill_matrix_v2_prod.employee_certificates
    -- SET is_active = false
    -- WHERE expiry_date IS NOT NULL 
    --   AND expiry_date < CURRENT_TIMESTAMP
    --   AND is_active = true;
    
    -- GET DIAGNOSTICS updated_count = ROW_COUNT;
    -- RETURN updated_count;
    
    RETURN 0;
END;
$function$
;

-- DROP FUNCTION skill_matrix_v2_prod.update_updated_at_column();

CREATE OR REPLACE FUNCTION skill_matrix_v2_prod.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$
;



-- ============================================================================
-- Quiz module: quizzes attached to a training module, with questions, options,
-- and employee attempts. Added for Jira SMT-8 (attempt a lesson or course quiz).
-- ============================================================================

CREATE TYPE skill_matrix_v2_prod."quiz_type_enum" AS ENUM (
	'Lesson',
	'Course Assessment');

CREATE TYPE skill_matrix_v2_prod."quiz_question_type_enum" AS ENUM (
	'Single Choice',
	'Multiple Choice');

CREATE TYPE skill_matrix_v2_prod."quiz_attempt_status_enum" AS ENUM (
	'In Progress',
	'Submitted');

-- skill_matrix_v2_prod.quiz definition
-- A quiz belongs to a training module (a lesson/course unit). pass_percentage is the
-- pass mark: an attempt passes when its percentage is >= this value.

CREATE TABLE skill_matrix_v2_prod.quiz (
	quiz_id serial4 NOT NULL,
	module_id int4 NULL,
	quiz_title varchar(255) NOT NULL,
	description text NULL,
	quiz_type skill_matrix_v2_prod."quiz_type_enum" DEFAULT 'Lesson'::skill_matrix_v2_prod.quiz_type_enum NOT NULL,
	pass_percentage numeric(5,2) DEFAULT 60 NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT quiz_pkey PRIMARY KEY (quiz_id),
	CONSTRAINT quiz_pass_percentage_check CHECK (((pass_percentage >= 0) AND (pass_percentage <= 100))),
	CONSTRAINT quiz_module_id_fkey FOREIGN KEY (module_id) REFERENCES skill_matrix_v2_prod.master_module(module_id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX idx_quiz_module_id ON skill_matrix_v2_prod.quiz USING btree (module_id);

-- Table Triggers

create trigger update_quiz_updated_at before
update
    on
    skill_matrix_v2_prod.quiz for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.quiz_question definition

CREATE TABLE skill_matrix_v2_prod.quiz_question (
	question_id serial4 NOT NULL,
	quiz_id int4 NOT NULL,
	question_text text NOT NULL,
	question_type skill_matrix_v2_prod."quiz_question_type_enum" DEFAULT 'Single Choice'::skill_matrix_v2_prod.quiz_question_type_enum NOT NULL,
	marks numeric(5,2) DEFAULT 1 NOT NULL,
	display_order int4 DEFAULT 1 NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT quiz_question_pkey PRIMARY KEY (question_id),
	CONSTRAINT quiz_question_order_unique UNIQUE (quiz_id, display_order),
	CONSTRAINT quiz_question_marks_check CHECK ((marks > 0)),
	CONSTRAINT quiz_question_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES skill_matrix_v2_prod.quiz(quiz_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX idx_quizquestion_quiz_id ON skill_matrix_v2_prod.quiz_question USING btree (quiz_id);

-- Table Triggers

create trigger update_quizquestion_updated_at before
update
    on
    skill_matrix_v2_prod.quiz_question for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.quiz_option definition
-- is_correct marks the right option(s). It must never be sent to the browser before submit.

CREATE TABLE skill_matrix_v2_prod.quiz_option (
	option_id serial4 NOT NULL,
	question_id int4 NOT NULL,
	option_text text NOT NULL,
	is_correct bool DEFAULT false NOT NULL,
	display_order int4 DEFAULT 1 NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT quiz_option_pkey PRIMARY KEY (option_id),
	CONSTRAINT quiz_option_order_unique UNIQUE (question_id, display_order),
	CONSTRAINT quiz_option_option_question_unique UNIQUE (option_id, question_id),
	CONSTRAINT quiz_option_question_id_fkey FOREIGN KEY (question_id) REFERENCES skill_matrix_v2_prod.quiz_question(question_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX idx_quizoption_question_id ON skill_matrix_v2_prod.quiz_option USING btree (question_id);

-- Table Triggers

create trigger update_quizoption_updated_at before
update
    on
    skill_matrix_v2_prod.quiz_option for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.quiz_attempt definition
-- One attempt by one employee. Once status is 'Submitted' the row is locked
-- (see quiz_lock_submitted_attempt below) and must hold its score and result.

CREATE TABLE skill_matrix_v2_prod.quiz_attempt (
	attempt_id serial4 NOT NULL,
	quiz_id int4 NOT NULL,
	employee_id int4 NOT NULL,
	status skill_matrix_v2_prod."quiz_attempt_status_enum" DEFAULT 'In Progress'::skill_matrix_v2_prod.quiz_attempt_status_enum NOT NULL,
	started_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	submitted_at timestamp NULL,
	score numeric(7,2) NULL,
	max_score numeric(7,2) NULL,
	percentage numeric(5,2) NULL,
	passed bool NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT quiz_attempt_pkey PRIMARY KEY (attempt_id),
	CONSTRAINT quiz_attempt_submitted_check CHECK (((status <> 'Submitted'::skill_matrix_v2_prod.quiz_attempt_status_enum) OR ((submitted_at IS NOT NULL) AND (score IS NOT NULL) AND (max_score IS NOT NULL) AND (percentage IS NOT NULL) AND (passed IS NOT NULL)))),
	CONSTRAINT quiz_attempt_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES skill_matrix_v2_prod.quiz(quiz_id) ON DELETE RESTRICT ON UPDATE CASCADE,
	CONSTRAINT quiz_attempt_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES skill_matrix_v2_prod.employee(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX idx_quizattempt_quiz_id ON skill_matrix_v2_prod.quiz_attempt USING btree (quiz_id);
CREATE INDEX idx_quizattempt_employee_id ON skill_matrix_v2_prod.quiz_attempt USING btree (employee_id);
-- An employee has at most one open attempt per quiz.
CREATE UNIQUE INDEX uq_quizattempt_one_open ON skill_matrix_v2_prod.quiz_attempt USING btree (quiz_id, employee_id) WHERE (status = 'In Progress'::skill_matrix_v2_prod.quiz_attempt_status_enum);

-- Table Triggers

create trigger update_quizattempt_updated_at before
update
    on
    skill_matrix_v2_prod.quiz_attempt for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- skill_matrix_v2_prod.quiz_attempt_answer definition
-- One row per selected option. (option_id, question_id) must be a real pair, so an
-- answer can never point at an option of a different question.

CREATE TABLE skill_matrix_v2_prod.quiz_attempt_answer (
	attempt_answer_id serial4 NOT NULL,
	attempt_id int4 NOT NULL,
	question_id int4 NOT NULL,
	option_id int4 NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT quiz_attempt_answer_pkey PRIMARY KEY (attempt_answer_id),
	CONSTRAINT quiz_attempt_answer_unique UNIQUE (attempt_id, question_id, option_id),
	CONSTRAINT quiz_attempt_answer_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES skill_matrix_v2_prod.quiz_attempt(attempt_id) ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT quiz_attempt_answer_option_question_fkey FOREIGN KEY (option_id, question_id) REFERENCES skill_matrix_v2_prod.quiz_option(option_id, question_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX idx_quizattemptanswer_attempt_id ON skill_matrix_v2_prod.quiz_attempt_answer USING btree (attempt_id);
CREATE INDEX idx_quizattemptanswer_question_id ON skill_matrix_v2_prod.quiz_attempt_answer USING btree (question_id);

-- Table Triggers

create trigger update_quizattemptanswer_updated_at before
update
    on
    skill_matrix_v2_prod.quiz_attempt_answer for each row execute function skill_matrix_v2_prod.update_updated_at_column();


-- Locking: a submitted attempt can no longer change.

CREATE OR REPLACE FUNCTION skill_matrix_v2_prod.quiz_lock_submitted_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.status = 'Submitted' THEN
        RAISE EXCEPTION 'Quiz attempt % is submitted and locked', OLD.attempt_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$function$
;

create trigger quiz_attempt_lock_submitted before
update
    on
    skill_matrix_v2_prod.quiz_attempt for each row execute function skill_matrix_v2_prod.quiz_lock_submitted_attempt();

CREATE OR REPLACE FUNCTION skill_matrix_v2_prod.quiz_block_submitted_answers()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    target_attempt int4;
    attempt_status skill_matrix_v2_prod.quiz_attempt_status_enum;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_attempt := OLD.attempt_id;
    ELSE
        target_attempt := NEW.attempt_id;
    END IF;

    -- No row means the attempt itself is being deleted (cascade): allow that.
    SELECT status INTO attempt_status
    FROM skill_matrix_v2_prod.quiz_attempt
    WHERE attempt_id = target_attempt;

    IF attempt_status = 'Submitted' THEN
        RAISE EXCEPTION 'Quiz attempt % is submitted and locked', target_attempt
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$
;

create trigger quiz_attempt_answer_block_submitted before
insert or
update or
delete
    on
    skill_matrix_v2_prod.quiz_attempt_answer for each row execute function skill_matrix_v2_prod.quiz_block_submitted_answers();
