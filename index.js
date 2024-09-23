const express = require("express");
const { Sequelize, DataTypes } = require("sequelize");
const moment = require("moment");
require("moment-timezone"); // Extend moment with timezone support

// Initialize express application
const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

// Connect to PostgreSQL
const sequelize = new Sequelize("myappdb", "postgres", "Test1234", {
  host: "localhost",
  dialect: "postgres",
});

// Define Resource model
const Resource = sequelize.define("Resource", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  workingHours: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  workingDays: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: false,
  },
  serviceTypes: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: false,
  },
});

// Define Service model
const Service = sequelize.define("Service", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  assignedTo: {
    type: DataTypes.INTEGER,
    references: {
      model: Resource,
      key: "id",
    },
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  deadline: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: false,
  },
});

// Create associations
Resource.hasMany(Service, { foreignKey: "assignedTo" });
Service.belongsTo(Resource, { foreignKey: "assignedTo" });

// Connect to PostgreSQL
sequelize
  .authenticate()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch((err) => console.error("Unable to connect to PostgreSQL:", err));

// Function to schedule services
async function scheduleLongService(
  name,
  resourceId,
  duration,
  deadline,
  priority
) {
  const MAX_CHUNK_DURATION = 480; // 8 hours
  let remainingDuration = duration;
  const endOfDeadline = moment(deadline).endOf("day");
  let currentStartTime = moment();
  let newDeadline = null;

  const resource = await Resource.findByPk(resourceId);
  if (!resource) throw new Error("Resource not found");

  const servicesToInsert = [];

  while (remainingDuration > 0) {
    const dayOfWeek = currentStartTime.format("dddd");

    if (
      resource.workingDays.includes(dayOfWeek) &&
      resource.workingHours[dayOfWeek]?.length > 0
    ) {
      for (const slot of resource.workingHours[dayOfWeek]) {
        const slotStart = moment(slot.start, "HH:mm").day(dayOfWeek).set({
          year: currentStartTime.year(),
          month: currentStartTime.month(),
          date: currentStartTime.date(),
        });
        const slotEnd = moment(slot.end, "HH:mm").day(dayOfWeek).set({
          year: currentStartTime.year(),
          month: currentStartTime.month(),
          date: currentStartTime.date(),
        });

        if (currentStartTime.isBefore(slotStart)) currentStartTime = slotStart;

        if (currentStartTime.isBetween(slotStart, slotEnd, null, "[)")) {
          const availableDuration = slotEnd.diff(currentStartTime, "minutes");
          const serviceDuration = Math.min(
            availableDuration,
            Math.min(remainingDuration, MAX_CHUNK_DURATION)
          );

          servicesToInsert.push({
            name: `${name} (Part ${Math.ceil(
              (duration - remainingDuration + 1) / MAX_CHUNK_DURATION
            )})`,
            assignedTo: resourceId,
            duration: serviceDuration,
            deadline: endOfDeadline.toDate(),
            priority,
            startTime: currentStartTime.toDate(),
            endTime: moment(currentStartTime)
              .add(serviceDuration, "minutes")
              .toDate(),
          });

          remainingDuration -= serviceDuration;
          currentStartTime = moment(currentStartTime).add(
            serviceDuration,
            "minutes"
          );

          if (remainingDuration <= 0) break;
        }
      }
    }

    if (remainingDuration > 0) {
      currentStartTime.add(1, "day").startOf("day");
      if (currentStartTime.isAfter(endOfDeadline))
        newDeadline = currentStartTime.toDate();
    }
  }

  if (remainingDuration > 0)
    throw new Error(
      "Could not schedule the entire task within the given deadline."
    );

  await Service.bulkCreate(servicesToInsert);
  return newDeadline;
}

// Check availability endpoint
app.post("/check-availability", async (req, res) => {
  const { resourceId, duration, startDay, endDay } = req.body;

  try {
    const resource = await Resource.findByPk(resourceId);
    if (!resource) {
      return res.status(404).send({ message: "Resource not found" });
    }

    let currentStartTime = startDay ? moment(startDay) : moment();
    let endSearchTime = endDay
      ? moment(endDay).endOf("day")
      : moment().add(7, "days");
    let availableSlots = [];

    while (currentStartTime.isBefore(endSearchTime)) {
      const dayOfWeek = currentStartTime.format("dddd");

      if (
        resource.workingDays.includes(dayOfWeek) &&
        resource.workingHours[dayOfWeek]?.length > 0
      ) {
        for (const slot of resource.workingHours[dayOfWeek]) {
          const slotStart = moment(slot.start, "HH:mm").day(dayOfWeek).set({
            year: currentStartTime.year(),
            month: currentStartTime.month(),
            date: currentStartTime.date(),
          });
          const slotEnd = moment(slot.end, "HH:mm").day(dayOfWeek).set({
            year: currentStartTime.year(),
            month: currentStartTime.month(),
            date: currentStartTime.date(),
          });

          const existingServices = await Service.findAll({
            where: {
              assignedTo: resourceId,
              startTime: {
                [Sequelize.Op.gte]: slotStart.toDate(),
                [Sequelize.Op.lt]: slotEnd.toDate(),
              },
            },
          });

          let availableStart = slotStart;
          for (const service of existingServices) {
            const serviceStart = moment(service.startTime);
            const serviceEnd = moment(service.endTime);

            if (
              availableStart.add(duration, "minutes").isBefore(serviceStart)
            ) {
              availableSlots.push({
                startTime: availableStart.toDate(),
                endTime: moment(availableStart)
                  .add(duration, "minutes")
                  .toDate(),
              });
            }
            availableStart = serviceEnd;
          }

          if (availableStart.add(duration, "minutes").isBefore(slotEnd)) {
            availableSlots.push({
              startTime: availableStart.toDate(),
              endTime: moment(availableStart).add(duration, "minutes").toDate(),
            });
          }
        }
      }

      currentStartTime.add(1, "day").startOf("day");
    }

    if (availableSlots.length === 0) {
      return res.status(404).send({ message: "No available slots found" });
    }

    return res.status(200).send({ availableSlots });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Book appointment endpoint
app.post("/book-appointment", async (req, res) => {
  const { resourceId, name, startTime, duration, priority } = req.body;

  try {
    const resource = await Resource.findByPk(resourceId);
    if (!resource) {
      return res.status(404).send({ message: "Resource not found" });
    }

    const startMoment = moment(startTime);
    const endMoment = startMoment.clone().add(duration, "minutes");
    const dayOfWeek = startMoment.format("dddd");
    const workingHours = resource.workingHours[dayOfWeek];

    if (!workingHours || workingHours.length === 0) {
      return res
        .status(400)
        .send({ message: `Resource does not work on ${dayOfWeek}` });
    }

    let isValidSlot = false;

    for (const slot of workingHours) {
      const slotStart = moment(slot.start, "HH:mm").day(dayOfWeek).set({
        year: startMoment.year(),
        month: startMoment.month(),
        date: startMoment.date(),
      });
      const slotEnd = moment(slot.end, "HH:mm").day(dayOfWeek).set({
        year: startMoment.year(),
        month: startMoment.month(),
        date: startMoment.date(),
      });

      if (
        startMoment.isBetween(slotStart, slotEnd, null, "[)") &&
        endMoment.isBetween(slotStart, slotEnd, null, "[)")
      ) {
        isValidSlot = true;
        break;
      }
    }

    if (!isValidSlot) {
      return res
        .status(400)
        .send({ message: "Selected time is outside working hours" });
    }

    const conflictingService = await Service.findOne({
      where: {
        assignedTo: resourceId,
        [Sequelize.Op.or]: [
          {
            startTime: { [Sequelize.Op.lt]: endMoment.toDate() },
            endTime: { [Sequelize.Op.gt]: startMoment.toDate() },
          },
        ],
      },
    });

    if (conflictingService) {
      return res
        .status(400)
        .send({ message: "This time slot is already booked" });
    }

    const newService = await Service.create({
      name,
      assignedTo: resourceId,
      duration,
      priority,
      startTime: startMoment.toDate(),
      endTime: endMoment.toDate(),
      deadline: endMoment.toDate(),
    });

    res.status(201).send({
      message: "Appointment booked successfully",
      service: newService,
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Services endpoints
app.post("/services", async (req, res) => {
  const { name, assignedTo, duration, deadline, priority } = req.body;

  try {
    const newDeadline = await scheduleLongService(
      name,
      assignedTo,
      duration,
      deadline,
      priority
    );
    if (newDeadline) {
      res.status(201).send({
        message:
          "Service scheduled successfully, but the original deadline could not be met. New deadline is: " +
          newDeadline,
      });
    } else {
      res.status(201).send({ message: "Service scheduled successfully" });
    }
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get("/services", async (req, res) => {
  const services = await Service.findAll({ include: Resource });
  res.send(services);
});
app.get("/resources", async (req, res) => {
  try {
    const resources = await Resource.findAll(); // Fetch all resources
    res.status(200).send(resources); // Send the resources back in the response
  } catch (error) {
    res.status(500).send({ error: error.message }); // Handle errors
  }
});
app.post("/resources", async (req, res) => {
  const { name, workingHours, workingDays, serviceTypes } = req.body;

  try {
    const newResource = new Resource({
      name,
      workingHours,
      workingDays,
      serviceTypes,
    });

    await newResource.save();
    res.status(201).send({
      message: "Resource created successfully",
      resource: newResource,
    });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.delete("/services/:id", async (req, res) => {
  const { id } = req.params;
  await Service.destroy({ where: { id } });
  res.status(204).send();
});

app.delete("/resources/:id", async (req, res) => {
  const { id } = req.params;
  await Resource.destroy({ where: { id } });
  res.status(204).send();
});

// Sync database and start the server
sequelize.sync().then(() => {
  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
});
