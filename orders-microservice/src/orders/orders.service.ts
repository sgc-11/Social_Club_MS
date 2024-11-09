import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from 'src/entities/order.entity';
import { Product } from 'src/entities/product.entity';
import { CreateOrderDto, UpdateOrderDto } from './dtos/CreateOrder.dto';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';


@Injectable()
export class OrdersMicroService {
    constructor(
        @InjectRepository(Order)
        private ordersRepository: Repository<Order>,
        @InjectRepository(Product)
        private productsRepository: Repository<Product>,
        @Inject('NATS_SERVICE')
        private natsClient: ClientProxy
    ) {}

    async createOrder(createOrderDto: CreateOrderDto) {
        const { liquorType, quantity, eventServed } = createOrderDto;

        // Find product by liquor type
        const product = await this.productsRepository.findOne({ where: { liquorType } });
        if (!product) {
            throw new NotFoundException(`Product with liquor type "${liquorType}" not found.`);
        }

        // Check stock availability
        if (product.stockLevel < quantity) {
            throw new BadRequestException(`Insufficient stock for ${liquorType}. Only ${product.stockLevel} available.`);
        }

        // Verify booking existence if eventServed is provided
        if (eventServed) {
            const bookingExists = await firstValueFrom(
                this.natsClient.send({ cmd: 'checkBooking' }, { eventId: eventServed })
            );

            if (!bookingExists) {
                throw new NotFoundException(`Booking with ID "${eventServed}" not found.`);
            }
        }

        // Deduct stock level and save product
        product.stockLevel -= quantity;
        await this.productsRepository.save(product);

        // Create and save the order
        const order = this.ordersRepository.create({
            product,
            quantity,
            eventServed: eventServed ? { id: eventServed } : null, // reference only the ID
        });

        return await this.ordersRepository.save(order);
    }

        // Find all orders, including product and event information
        async findAllOrders() {
            return await this.ordersRepository.find({ relations: ['product'] });
        }
    
        // Find a single order by ID with product information
        async findOneOrder(id: number) {
            const order = await this.ordersRepository.findOne({
                where: { id },
                relations: ['product'],
            });
            if (!order) {
                throw new NotFoundException(`Order with ID ${id} not found.`);
            }
            return order;
        }
    
        // Update an existing order, including stock adjustment and NATS event check if needed
        async updateOrder(id: number, updateOrderDto: UpdateOrderDto) {
            const { liquorType, quantity, eventServed } = updateOrderDto;
        
            const order = await this.findOneOrder(id);
        
            let product = order.product;
            if (liquorType && liquorType !== product.liquorType) {
                product = await this.productsRepository.findOne({ where: { liquorType } });
                if (!product) {
                    throw new NotFoundException(`Product with liquor type "${liquorType}" not found.`);
                }
            }
        
            if (product.stockLevel < quantity) {
                throw new BadRequestException(`Insufficient stock for ${liquorType}. Only ${product.stockLevel} available.`);
            }
        
            if (eventServed && eventServed !== order.eventServed?.id) {
                // Communicate with the other microservice to check if the booking exists
                const bookingExists = await firstValueFrom(
                    this.natsClient.send({ cmd: 'checkBooking' }, { eventId: eventServed })
                );
                
                if (!bookingExists) {
                    throw new NotFoundException(`Booking with ID "${eventServed}" not found.`);
                }
        
                // Fetch the full Booking details from the other microservice
                const bookingDetails = await firstValueFrom(
                    this.natsClient.send({ cmd: 'getBookingDetails' }, { eventId: eventServed })
                );
        
                if (!bookingDetails) {
                    throw new NotFoundException(`Booking details for ID "${eventServed}" not found.`);
                }
        
                // Set the eventServed property to the received Booking details
                order.eventServed = bookingDetails; // This should be the full Booking object returned from NATS
            }
        
            order.product = product;
            order.quantity = quantity;
        
            // Update stock level if quantity changes
            product.stockLevel -= (quantity - order.quantity);
            await this.productsRepository.save(product);
        
            return await this.ordersRepository.save(order);
        }
        
        
    
        // Delete an order and return a confirmation message
        async removeOrder(id: number) {
            const order = await this.findOneOrder(id);
            await this.ordersRepository.remove(order);
            return { message: `Order ${id} has been removed.` };
        }

}
