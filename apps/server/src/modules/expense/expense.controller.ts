import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ExpenseService } from './expense.service'
import { CreateExpenseDto } from './dto/create-expense.dto'
import { UpdateExpenseDto } from './dto/update-expense.dto'
import { QueryExpenseDto } from './dto/query-expense.dto'
import { SetBudgetDto } from './dto/set-budget.dto'

@Controller('expense')
@UseGuards(JwtAuthGuard)
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @HttpCode(200)
  create(@Request() req, @Body() dto: CreateExpenseDto) {
    return this.expenseService.create(req.user.id, dto)
  }

  // 静态路径必须写在 :id 之前，否则 list/summary/export 会被当成 id
  @Get('list/:babyId')
  findList(
    @Param('babyId') babyId: string,
    @Query() query: QueryExpenseDto,
    @Request() req,
  ) {
    return this.expenseService.findList(req.user.id, babyId, query)
  }

  @Get('summary/:babyId')
  getSummary(
    @Param('babyId') babyId: string,
    @Query('month') month: string,
    @Request() req,
  ) {
    return this.expenseService.getSummary(req.user.id, babyId, month)
  }

  @Get('export/:babyId')
  export(
    @Param('babyId') babyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req,
  ) {
    return this.expenseService.export(req.user.id, babyId, startDate, endDate)
  }

  @Put('budget/:babyId')
  setBudget(
    @Param('babyId') babyId: string,
    @Body() dto: SetBudgetDto,
    @Request() req,
  ) {
    return this.expenseService.setBudget(req.user.id, babyId, dto)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.expenseService.findOne(req.user.id, id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto, @Request() req) {
    return this.expenseService.update(req.user.id, id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.expenseService.remove(req.user.id, id)
  }
}