# Calendar Scheduling Service

## Overview

This Calendar Scheduling Service is designed to manage multiple services and resources efficiently. It provides a flexible scheduling solution for organizations or individuals who need to handle various tasks with different attributes and priorities.

## Key Features

- **Service and Resource Management:** The system supports two main entities: Services and Resources.
- **Resource Attributes:**
    - **Working Hours:** Define the working hours for each resource (Day specific)
    - **Working Days:** Specify the working days for each resource.
    - **Service Types:** Assign different service types that a resource can provide each day.
    - **Multiple Services:** Allow a resource to provide more than one service in a single day.
- **Service Attributes:**
    - **Duration Time:** Set the duration for each service (could be set by the user)
    - **Deadline:** Specify the deadline for each service.
    - **Priority:** Assign a priority level to each service.
- **Task Management:** Override or reschedule tasks based on resource availability.

## Rescheduling Approaches

- **Push All Services:** Attempt to push all services and handle the higher priority one. If this cannot work, proceed to the next approach.
- **Reschedule Existing Tasks:** Reschedule one of the existing tasks and replace it with the higher priority task.
- **Cancel Existing Tasks:** Cancel one of the existing tasks to accommodate the higher priority task.

## Usage

This service can be used by organizations or individuals looking to streamline their scheduling processes, ensuring efficient use of resources while accommodating various service requirements and priorities.
