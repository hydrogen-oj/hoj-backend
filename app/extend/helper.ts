//import CryptoJS from 'crypto-js';

export default {
    success(content: any = null) {
        this.ctx.status = 200;
        this.ctx.body = {
            status: 200,
            info: 'processed successfully',
            data: content
        };
    },
    response(status: number, info: string, content: any = null) {
        this.ctx.status = 200;
        this.ctx.body = {
            status: status,
            info: info,
            data: content
        };
    },
    failure(status: number, info: string, content: any = null) {
        this.ctx.status = status;
        this.ctx.body = {
            status: status,
            info: info,
            content: content
        };
    },
    getTime() {
        return Math.floor(Number(new Date()) / 1000);
    }
};

