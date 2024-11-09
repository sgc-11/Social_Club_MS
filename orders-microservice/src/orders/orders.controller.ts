import { Controller, Inject, Post, Get, Put, Delete, Body, Param } from '@nestjs/common';
import { ClientProxy, MessagePattern } from '@nestjs/microservices';
import { OrdersMicroService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto } from './dtos/CreateOrder.dto';
import { BadRequestException } from '@nestjs/common';


@Controller('orders')
export class OrdersMicroserviceController {
    constructor (
        private readonly ordersService: OrdersMicroService    
    ){}

    @MessagePattern({ cmd: 'createOrder' })
    async createOrder(@Body() createOrderDto: CreateOrderDto) {
        try {
            return await this.ordersService.createOrder(createOrderDto);
        } catch (error) {
            throw new BadRequestException(error.message);
        }
    }

    @MessagePattern({ cmd: 'findAllOrders'})
    findAllOrders() {
        return this.ordersService.findAllOrders();
    }

    @MessagePattern({ cmd: 'findOneOrder' })
    findOneOrder(@Param('id') id: number) {
        return this.ordersService.findOneOrder(id);
    }

    @MessagePattern({ cmd: 'updateOrder' })
    updateOrder(@Param('id') id: number, @Body() updateOrderDto: UpdateOrderDto) {
        return this.ordersService.updateOrder(id, updateOrderDto);
    }

    @MessagePattern({ cmd: 'removeOrder' })
    removeOrder(@Param('id') id: number) {
        return this.ordersService.removeOrder(id);
    }

}
