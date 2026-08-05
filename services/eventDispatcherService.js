const eventService =
    require("./eventService");

const merchantWebhookService =
    require("./merchantWebhookService");

class EventDispatcherService {

    async dispatchPendingEvents() {

        const events =

            await eventService.getPendingEvents();

        for (const event of events) {

            try {

                await merchantWebhookService.deliverEvent(

                    event.merchant,

                    event

                );

                await eventService.markDelivered(

                    event._id

                );

            }

            catch (error) {

                console.error(

                    error.message

                );

            }

        }

    }

}

module.exports =
    new EventDispatcherService();